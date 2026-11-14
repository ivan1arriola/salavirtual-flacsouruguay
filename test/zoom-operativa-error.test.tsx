import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZoomIntegrationWarning } from "@/src/bootstrap/ui/reuniones/zoom-integration-warning";

describe("aviso de integración Zoom", () => {
  it("ofrece diagnóstico a administración y deja el detalle técnico desplegable", () => {
    const html = renderToStaticMarkup(createElement(ZoomIntegrationWarning, { error: "Error 429", rol: "ADMINISTRACION" }));
    expect(html).toContain("No se pudo completar la sincronización con Zoom");
    expect(html).toContain("Esto no confirma que el enlace haya dejado de funcionar");
    expect(html).toContain('href="/centro-operaciones/zoom"');
    expect(html).toMatch(/<details[^>]*><summary>Ver detalle técnico<\/summary>/);
    expect(html).toContain("Error 429");
  });

  it("orienta a monitoreo a registrar una incidencia sin enlazar a administración", () => {
    const html = renderToStaticMarkup(createElement(ZoomIntegrationWarning, { error: "Error 429", rol: "ASISTENTE_TECNICO" }));
    expect(html).toContain('href="#incidencias"');
    expect(html).not.toContain('/centro-operaciones/zoom');
  });
});
