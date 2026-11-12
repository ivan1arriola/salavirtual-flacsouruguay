import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ZoomJoinActions } from "../src/components/zoom-join-actions";
import { ZoomLinkStatus } from "../src/components/zoom-link-status";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const URL_ZOOM = "https://flacso.zoom.us/j/123456789";

describe("acciones de unión a Zoom", () => {
  it("conserva los textos visibles y no cambia sin contexto", () => {
    const html = renderToStaticMarkup(createElement(ZoomJoinActions, { url: URL_ZOOM }));
    expect(html).toContain("Unirse");
    expect(html).toContain("Copiar enlace");
    expect(html).toContain(`href="${URL_ZOOM}"`);
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
    expect(html).not.toContain("aria-label=");
  });

  it("con contexto da nombres accesibles que identifican el encuentro", () => {
    const html = renderToStaticMarkup(
      createElement(ZoomJoinActions, { url: URL_ZOOM, contexto: "martes 10 de noviembre, 10:00" })
    );
    expect(html).toContain(
      'aria-label="Unirse a martes 10 de noviembre, 10:00 (se abre en una pestaña nueva)"'
    );
    expect(html).toContain('aria-label="Copiar enlace de martes 10 de noviembre, 10:00"');
  });

  it("avisa que el enlace abre una pestaña nueva solo para lectores de pantalla", () => {
    const html = renderToStaticMarkup(createElement(ZoomJoinActions, { url: URL_ZOOM }));
    expect(html).toContain('<span class="sr-only"> (se abre en una pestaña nueva)</span>');
  });

  it("el anuncio del resultado de copiar va fuera del botón (el contenido de un botón es presentacional)", () => {
    const html = renderToStaticMarkup(createElement(ZoomJoinActions, { url: URL_ZOOM }));
    const boton = html.match(/<button[\s\S]*?<\/button>/)?.[0] ?? "";
    expect(boton).not.toContain("role=");
    expect(html).toMatch(/<\/button><span role="status" class="sr-only"><\/span>/);
  });
});

describe("estado del enlace de Zoom", () => {
  const props = { esAdmin: true, eventoProveedorId: "ev1", operacion: "PROVISIONAR" as const };

  it("mantiene las clases y las etiquetas de cada estado", () => {
    const etiquetas = {
      LISTO: "Enlace listo",
      ATENCION: "Enlace listo, cambios sin sincronizar",
      PENDIENTE: "Enlace pendiente",
      ERROR: "Error al crear el enlace"
    } as const;
    for (const [estado, etiqueta] of Object.entries(etiquetas)) {
      const html = renderToStaticMarkup(
        createElement(ZoomLinkStatus, { ...props, estado: estado as keyof typeof etiquetas })
      );
      expect(html).toContain(`status zoom-link-status is-${estado.toLowerCase()}`);
      expect(html).toContain(etiqueta);
    }
  });

  it("separa la etiqueta del estado del botón de reintento", () => {
    const html = renderToStaticMarkup(createElement(ZoomLinkStatus, { ...props, estado: "ERROR" }));
    expect(html).toContain('<span class="zoom-link-status-texto">Error al crear el enlace</span>');
    expect(html).toContain("Reintentar");
  });

  it("el nombre accesible del reintento identifica el encuentro", () => {
    const html = renderToStaticMarkup(
      createElement(ZoomLinkStatus, { ...props, estado: "ERROR", contexto: "martes 10 de noviembre, 10:00" })
    );
    expect(html).toContain('aria-label="Reintentar el enlace de martes 10 de noviembre, 10:00"');
  });

  it("solo administración ve el reintento, y no con el enlace listo", () => {
    expect(
      renderToStaticMarkup(createElement(ZoomLinkStatus, { ...props, esAdmin: false, estado: "ERROR" }))
    ).not.toContain("Reintentar");
    expect(renderToStaticMarkup(createElement(ZoomLinkStatus, { ...props, estado: "LISTO" }))).not.toContain(
      "Reintentar"
    );
    expect(
      renderToStaticMarkup(
        createElement(ZoomLinkStatus, { ...props, estado: "ERROR", eventoProveedorId: null })
      )
    ).not.toContain("Reintentar");
  });
});
