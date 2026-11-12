import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("frontera del cierre de asistencia", () => {
  it("la ruta HTTP delega en bootstrap y no en el servicio legado", () => {
    const source = readFileSync(join(process.cwd(), "app/api/v1/asistencia/duracion/route.ts"), "utf8");

    expect(source).toContain("@/src/bootstrap/asistencia.server");
    expect(source).not.toContain("@/src/modules/asistencia/reporte-duracion.service");
  });

  it("la consola reutiliza el mismo endpoint de duración", () => {
    const source = readFileSync(
      join(process.cwd(), "src/components/operational-assistance-closure-form.tsx"),
      "utf8"
    );

    expect(source).toContain('fetch("/api/v1/asistencia/duracion"');
  });
});
