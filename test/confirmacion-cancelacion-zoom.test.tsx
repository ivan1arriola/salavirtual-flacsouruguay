import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmacionCancelacionZoom } from "../src/modules/reuniones/presentation/components/confirmacion-cancelacion-zoom";

describe("confirmación de cancelación Zoom", () => {
  it("identifica la fecha y ofrece volver sin cancelar un encuentro", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmacionCancelacionZoom, {
        detalle: { tipo: "encuentro", fecha: "lunes 10 de octubre, 10:00" },
        onCerrar: vi.fn(),
        onConfirmar: vi.fn()
      })
    );
    expect(html).toContain("lunes 10 de octubre, 10:00");
    expect(html).toContain("Volver");
    expect(html).toContain("aria-labelledby=");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("<dialog");
  });

  it("explica cuántos encuentros de la serie se cancelarán", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmacionCancelacionZoom, {
        detalle: { tipo: "serie", cantidad: 3 },
        onCerrar: vi.fn(),
        onConfirmar: vi.fn()
      })
    );
    expect(html).toContain("3 encuentros");
    expect(html).toContain("toda la serie");
    expect(html).toContain("Cancelar serie");
  });
});
