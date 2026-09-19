import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MODULES_ROOT = new URL("../src/modules/", import.meta.url);
const ALL_TS_FILES = readdirSync(MODULES_ROOT, {
  recursive: true,
  encoding: "utf8"
})
  .filter((relativePath) => relativePath.endsWith(".ts") && !relativePath.endsWith(".d.ts"))
  .slice()
  .sort();

// Identificar archivos puramente de dominio:
// 1. En modulos migrados: cualquier archivo dentro de un subdirectorio `domain/`.
// 2. En modulos legacy: cualquier archivo que no sea service, adapter o xlsx, y no sea barrel de modulo (api/presentation).
const PURE_MODULES = ALL_TS_FILES.filter((relativePath) => {
  const parts = relativePath.split("/");
  if (parts.length > 2) {
    const layer = parts[1];
    if (layer === "domain") return true;
    if (["ports", "application", "infrastructure", "presentation"].includes(layer)) {
      return false;
    }
  }
  if (parts.length === 2 && (parts[1] === "api.ts" || parts[1] === "presentation.ts")) {
    return false;
  }
  return (
    !relativePath.endsWith(".service.ts") &&
    !relativePath.endsWith(".adapter.ts") &&
    !relativePath.endsWith(".xlsx.ts")
  );
});

const FORBIDDEN_EFFECTS = [
  { name: "Prisma", pattern: /@prisma\/client/ },
  { name: "Next.js", pattern: /from ["']next(?:\/|["'])/ },
  { name: "entorno", pattern: /process\.env/ },
  { name: "estado global", pattern: /globalThis/ },
  { name: "red", pattern: /\bfetch\s*\(/ },
  { name: "reloj del sistema", pattern: /\b(?:new Date|Date\.now)\s*\(/ },
  { name: "azar del sistema", pattern: /\b(?:Math\.random|crypto\.randomUUID)\s*\(/ },
  { name: "consola", pattern: /\bconsole\./ },
  { name: "clases", pattern: /\bclass\s+/ },
  { name: "variables reasignables", pattern: /\b(?:let|var)\s+/ },
  {
    name: "mutacion de colecciones",
    pattern: /\.(?:push|pop|shift|unshift|splice|reverse|sort|set|delete|clear|add)\s*\(/
  }
] as const;

describe("arquitectura funcional", () => {
  for (const relativePath of PURE_MODULES) {
    it(`${relativePath} permanece libre de efectos externos`, () => {
      const source = readFileSync(new URL(relativePath, MODULES_ROOT), "utf8");
      const effects = FORBIDDEN_EFFECTS.filter(({ pattern }) => pattern.test(source)).map(
        ({ name }) => name
      );

      expect(effects).toEqual([]);
    });
  }
});
