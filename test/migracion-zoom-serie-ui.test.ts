import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync(new URL("../src/components/migracion-zoom-aplicar-control.tsx", import.meta.url), "utf8");

describe("pantalla de migración con series bloqueadas", () => {
  it("etiqueta el estado SERIE y lo cuenta como caso de atención", () => {
    expect(control).toContain('SERIE: "Serie con varios encuentros"');
    expect(control).toContain('"NO_FUTURO", "SERIE"');
    expect(control).toContain("vistaPrevia.conteos.SERIE");
  });

  it("solo ofrece seleccionar los encuentros migrables, nunca los de una serie bloqueada", () => {
    expect(control).toContain('const migrable = fila.estado === "MIGRABLE";');
    expect(control).not.toMatch(/\["MIGRABLE"[^\]]*"SERIE"[^\]]*\]\.includes\(fila\.estado\)/);
  });
});
