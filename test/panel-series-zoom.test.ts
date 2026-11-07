import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync(new URL("../src/components/migracion-zoom-serie-control.tsx", import.meta.url), "utf8");
const pagina = readFileSync(new URL("../app/(gestion)/reuniones/migracion-zoom/page.tsx", import.meta.url), "utf8");

describe("panel de series Zoom", () => {
  it("la ruta antigua abre la vista de series Zoom", () => {
    expect(pagina).toContain('redirect("/reuniones?proveedor=zoom&vista=series")');
  });

  it("cada fila muestra su estado en texto, los conteos y el botón de la acción permitida", () => {
    expect(control).toContain("presentarDiagnosticoSerie(diagnostico)");
    expect(control).toContain("{presentacion.etiqueta}");
    expect(control).toContain("{presentacion.resumen}");
    expect(control).toContain("{accion.texto}");
    expect(control).toContain("data-estado-serie");
  });

  it("unificar usa la ruta de corrección y migrar/retomar la de series, siempre por una sola serie", () => {
    expect(control).toContain('const RUTA_UNIFICAR = "/api/v1/reuniones/migracion-zoom/series-enlaces";');
    expect(control).toContain("unificar ? RUTA_UNIFICAR :");
    expect(control).toContain('body: JSON.stringify({ modo: "PILOTO", serieClaves: [accion.serieClave] })');
  });

  it("antes de actuar abre un diálogo propio, accesible y que se cierra con Escape, sin window.confirm", () => {
    expect(control).toContain("textoConfirmacionAccion(accionPendiente.tipo, accionPendiente)");
    expect(control).toContain('aria-labelledby="confirmar-accion-serie"');
    expect(control).toContain('if (event.key === "Escape") { setConfirmar(null); setAccionPendiente(null); return; }');
    expect(control).not.toContain("window.confirm");
  });

  it("el resultado se explica con mensajes comprensibles y solo ofrece Reintentar si de verdad se puede", () => {
    expect(control).toContain("describirResultadoSerie(resultado)");
    expect(control).toContain("{mensaje.reintentable && (");
    expect(control).not.toContain("{resultado.reintentable && (");
    expect(control).toContain("<summary>Detalle técnico</summary>");
    expect(control).not.toMatch(/\{resultado\.mensaje\}/);
  });

  it("la conversión de series para convertir sigue siendo por selección y el botón no la duplica", () => {
    expect(control).toContain('!(presentacion.accionPrincipal.tipo === "MIGRAR" && migrable)');
    expect(control).toContain("const MAXIMO_SERIES = 5;");
  });

  it("hay un filtro para las series que necesitan unificar el enlace", () => {
    expect(control).toContain('id: "UNIFICAR", label: "Para unificar enlace"');
  });
});
