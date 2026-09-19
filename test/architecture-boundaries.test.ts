import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const MODULES_ROOT = join(process.cwd(), "src/modules");

type LayerName = "domain" | "ports" | "application" | "infrastructure" | "presentation";

type FileInfo = Readonly<{
  absPath: string;
  relPath: string;
  moduleName: string;
  layer?: LayerName;
  content: string;
  imports: readonly string[];
}>;

function extractImports(source: string): string[] {
  const staticMatches = source.matchAll(/(?:import|export)\s+(?:type\s+)?[\s\S]*?from\s+["']([^"']+)["']/g);
  const dynamicMatches = source.matchAll(/import\s*\(\s*["']([^"']+)["']\s*\)/g);
  const sideEffectMatches = source.matchAll(/import\s+["']([^"']+)["']/g);

  const results: string[] = [];
  for (const match of staticMatches) {
    if (match[1]) results.push(match[1]);
  }
  for (const match of dynamicMatches) {
    if (match[1]) results.push(match[1]);
  }
  for (const match of sideEffectMatches) {
    if (match[1]) results.push(match[1]);
  }
  return results;
}

function scanModules(dir: string): FileInfo[] {
  const entries = readdirSync(dir);
  const files: FileInfo[] = [];

  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      files.push(...scanModules(fullPath));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      const rel = relative(MODULES_ROOT, fullPath);
      const parts = rel.split("/");
      const moduleName = parts[0];
      const layerCandidate = parts[1];
      const layer = ["domain", "ports", "application", "infrastructure", "presentation"].includes(layerCandidate)
        ? (layerCandidate as LayerName)
        : undefined;

      const content = readFileSync(fullPath, "utf8");
      files.push({
        absPath: fullPath,
        relPath: rel,
        moduleName,
        layer,
        content,
        imports: extractImports(content)
      });
    }
  }

  return files;
}

describe("fronteras arquitectonicas de capas y modulos", () => {
  const files = scanModules(MODULES_ROOT);
  const layeredFiles = files.filter((f) => f.layer !== undefined);

  it("encuentra y clasifica archivos en modulos por capa", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  describe("aislamiento de capas en modulos migrados", () => {
    if (layeredFiles.length === 0) {
      it("se activara dinamicamente cuando existan modulos con estructura de capas", () => {
        expect(layeredFiles).toEqual([]);
      });
    } else {
      for (const file of layeredFiles) {
      if (file.layer === "domain") {
        it(`[domain] ${file.relPath} no importa capas superiores ni dependencias externas con efectos`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("/application") ||
            imp.includes("/presentation") ||
            imp.includes("@prisma/client") ||
            imp.startsWith("next") ||
            imp.startsWith("react") ||
            imp.includes("googleapis") ||
            imp.includes("nodemailer") ||
            imp === "server-only"
          );
          expect(forbidden, `Imports prohibidos en domain: ${forbidden.join(", ")}`).toEqual([]);
        });
      }

      if (file.layer === "ports") {
        it(`[ports] ${file.relPath} no importa infraestructura ni frameworks externos`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("/presentation") ||
            imp.includes("/application") ||
            imp.includes("@prisma/client") ||
            imp.startsWith("next") ||
            imp.startsWith("react") ||
            imp.includes("googleapis") ||
            imp.includes("nodemailer")
          );
          expect(forbidden, `Imports prohibidos en ports: ${forbidden.join(", ")}`).toEqual([]);
        });
      }

      if (file.layer === "application") {
        it(`[application] ${file.relPath} no importa infraestructura, presentacion ni Prisma/React/Next`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("/presentation") ||
            imp.includes("@prisma/client") ||
            imp.startsWith("next") ||
            imp.startsWith("react") ||
            imp.includes("googleapis") ||
            imp.includes("nodemailer")
          );
          expect(forbidden, `Imports prohibidos en application: ${forbidden.join(", ")}`).toEqual([]);
        });
      }

      if (file.layer === "presentation") {
        it(`[presentation] ${file.relPath} no importa infraestructura ni Prisma directamente`, () => {
          const forbidden = file.imports.filter((imp) =>
            imp.includes("/infrastructure") ||
            imp.includes("@prisma/client")
          );
          expect(forbidden, `Imports prohibidos en presentation: ${forbidden.join(", ")}`).toEqual([]);
        });
      }
    }
    }
  });

  describe("encapsulamiento entre modulos", () => {
    for (const file of files) {
      it(`${file.relPath} no importa rutas internas de capas de otros modulos`, () => {
        const forbiddenCrossImports = file.imports.filter((imp) => {
          // Detectar importaciones hacia subcarpetas internas de otro módulo:
          // Ej: @/src/modules/<otro>/(domain|application|ports|infrastructure)/...
          const match = imp.match(/@\/src\/modules\/([^/]+)\/(domain|application|ports|infrastructure|presentation)\//);
          if (match) {
            const importedModule = match[1];
            return importedModule !== file.moduleName;
          }
          return false;
        });

        expect(
          forbiddenCrossImports,
          `Acceso a ruta interna privada de otro modulo: ${forbiddenCrossImports.join(", ")}`
        ).toEqual([]);
      });
    }
  });

  describe("integraciones tecnicas externas (src/integrations/google)", () => {
    const googleFiles = scanDir(join(process.cwd(), "src/integrations/google"), join(process.cwd(), "src/integrations"));

    it("encuentra archivos en src/integrations/google", () => {
      expect(googleFiles.length).toBeGreaterThan(0);
    });

    for (const file of googleFiles) {
      it(`[google integration] ${file.relPath} no importa modulos de negocio, prisma ni presentacion`, () => {
        const forbidden = file.imports.filter((imp) =>
          imp.includes("@/src/modules") ||
          imp.includes("@/src/app") ||
          imp.includes("@prisma/client") ||
          imp.includes("@/src/lib/db") ||
          imp.startsWith("next") ||
          imp.startsWith("react")
        );
        expect(
          forbidden,
          `Imports prohibidos en cliente tecnico de Google: ${forbidden.join(", ")}`
        ).toEqual([]);
      });
    }
  });
});

function scanDir(dir: string, baseRoot: string): Readonly<{ absPath: string; relPath: string; content: string; imports: readonly string[] }>[] {
  if (!existsSync(dir)) return [];
  const entries = readdirSync(dir);
  const results: Array<{ absPath: string; relPath: string; content: string; imports: readonly string[] }> = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      results.push(...scanDir(fullPath, baseRoot));
    } else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) {
      const rel = relative(baseRoot, fullPath);
      const content = readFileSync(fullPath, "utf8");
      results.push({
        absPath: fullPath,
        relPath: rel,
        content,
        imports: extractImports(content),
      });
    }
  }
  return results;
}

