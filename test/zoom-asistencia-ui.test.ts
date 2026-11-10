import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (ruta: string) => readFileSync(ruta, "utf8");

describe("ficha de asistencia Zoom", () => {
  const pagina = leer("src/bootstrap/ui/reuniones/reunion-operativa-page.server.tsx");
  const lectura = leer("src/bootstrap/zoom-asistencia-lectura.server.ts");

  it("renderizar la ficha histórica no llama a Zoom ni escribe asistencia", () => {
    expect(pagina).toMatch(/leerAsistenciaZoomFicha/);
    expect(pagina).not.toMatch(/listarParticipantesReunionPasadaZoomHttp|resolverUuidInstanciaZoomHttp/);
    expect(pagina).not.toMatch(/eventoProveedor\.updateMany/);
    expect(lectura).not.toMatch(/\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(/);
    expect(lectura).not.toMatch(/zoom-client|zoom-reports|fetch\(/);
  });

  it("la ficha lee la tabla de Zoom y nunca la de Meet", () => {
    expect(lectura).toMatch(/registroAsistenciaZoom/);
    expect(lectura).not.toMatch(/registroAsistenciaMeet/);
  });

  it("los controles de conciliación solo se muestran a quien puede conciliar", () => {
    const componente = leer("src/components/zoom-asistencia-conciliacion.tsx");
    expect(componente).toMatch(/puedeConciliar \?/);
    expect(componente).toMatch(/asistencia\/conciliar/);
    expect(lectura).toMatch(/puedeConciliarAsistenciaZoom/);
  });
});
