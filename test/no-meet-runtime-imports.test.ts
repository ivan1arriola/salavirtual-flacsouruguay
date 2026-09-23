import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const roots = [
  join(process.cwd(), "app"),
  join(process.cwd(), "src/bootstrap"),
  join(process.cwd(), "src/components")
];

function sourceFiles(root: string): string[] {
  if (!existsSync(root)) return [];
  const files: string[] = [];
  for (const entry of readdirSync(root)) {
    const path = join(root, entry);
    const stat = statSync(path);
    if (stat.isDirectory()) files.push(...sourceFiles(path));
    else if (entry.endsWith(".ts") || entry.endsWith(".tsx")) files.push(path);
  }
  return files;
}

describe("frontera de compatibilidad del módulo meet", () => {
  const files = roots.flatMap(sourceFiles);

  it("encuentra código runtime para verificar", () => {
    expect(files.length).toBeGreaterThan(0);
  });

  for (const path of files) {
    const source = readFileSync(path, "utf8");
    const rel = relative(process.cwd(), path);

    it(`${rel} no depende de src/modules/meet`, () => {
      expect(
        source.includes("@/src/modules/meet/"),
        "El código runtime debe usar conferencias, archivos o bootstrap; meet es solo compatibilidad."
      ).toBe(false);
    });
  }
});
