import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const MODULES_ROOT = new URL("../src/modules/", import.meta.url);
const PURE_MODULES = readdirSync(MODULES_ROOT, {
  recursive: true,
  encoding: "utf8"
})
  .filter(
    (relativePath) =>
      relativePath.endsWith(".ts") &&
      !relativePath.endsWith(".service.ts") &&
      !relativePath.endsWith(".adapter.ts")
  )
  .slice()
  .sort();

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
