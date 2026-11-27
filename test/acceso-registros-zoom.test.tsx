import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { AccesoRegistrosZoom } from "../src/components/acceso-registros-zoom";

describe("acceso a registros Zoom importados", () => {
  it("ofrece a administración una consulta diferenciada de las reuniones operativas", () => {
    const html = renderToStaticMarkup(
      createElement(AccesoRegistrosZoom, { rol: "ADMINISTRACION" }),
    );
    expect(html).toContain('href="/configuracion/historico"');
    expect(html).toContain("Registros Zoom importados");
    expect(html).toContain("consulta");
  });

  it.each(["DOCENTE", "ASISTENTE_TECNICO"] as const)("no ofrece el acceso a %s", (rol) => {
    expect(renderToStaticMarkup(createElement(AccesoRegistrosZoom, { rol }))).toBe("");
  });
});
