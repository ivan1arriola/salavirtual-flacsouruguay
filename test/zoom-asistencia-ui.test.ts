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

describe("página de asistencia del encuentro (Zoom)", () => {
  const pagina = leer("app/(gestion)/reuniones/[solicitudId]/encuentros/[instanciaId]/asistencia/page.tsx");
  const rama = pagina.slice(
    pagina.indexOf("eventosProveedor.length === 0"),
    pagina.indexOf("const evento = encuentro.eventosProveedor[0]")
  );

  it("la rama Zoom lee lo persistido y no usa Workspace ni la planilla de Meet", () => {
    expect(rama).toMatch(/leerAsistenciaZoomFicha/);
    expect(rama).not.toMatch(/leerPlanillaAsistenciaGoogle|crearGoogleAuthJwt|crearArchivosRepository/);
  });

  it("la vista única de Zoom se usa en la página y la regeneración es solo para administración", () => {
    expect(rama).toMatch(/ZoomAsistenciaVista/);
    expect(rama).toMatch(/actor\.rol === "ADMINISTRACION"/);
  });
});
