import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZoomCopyIdButton } from "../src/components/zoom-copy-id-button";

describe("ZoomCopyIdButton", () => {
  it("renderiza el botón con el texto 'Copiar ID' y no usa role en el botón", () => {
    const html = renderToStaticMarkup(createElement(ZoomCopyIdButton, { meetingId: "84912345678" }));
    expect(html).toContain("Copiar ID");
    expect(html).not.toContain("<button role=");
    expect(html).toMatch(/<\/button><span role="status" class="sr-only"><\/span>/);
  });

  it("agrega nombre accesible cuando se proporciona contexto", () => {
    const html = renderToStaticMarkup(createElement(ZoomCopyIdButton, { meetingId: "84912345678", contexto: "Taller 1" }));
    expect(html).toContain('aria-label="Copiar ID de reunión de Taller 1"');
  });
});

