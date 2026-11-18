import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ConfiguracionError from "../app/(gestion)/configuracion/error";

describe("error de la configuración", () => {
  it("ofrece reintentar y volver al resumen, y muestra el código sin exponer el mensaje", () => {
    const error = Object.assign(new Error("Can't reach database server at db.interno:5432"), {
      digest: "abc123"
    });
    const html = renderToStaticMarkup(<ConfiguracionError error={error} retry={vi.fn()} />);
    expect(html.includes("Reintentar")).toBe(true);
    expect(html.includes('href="/configuracion"')).toBe(true);
    expect(html.includes("abc123")).toBe(true);
    expect(html.includes("db.interno")).toBe(false);
  });
});
