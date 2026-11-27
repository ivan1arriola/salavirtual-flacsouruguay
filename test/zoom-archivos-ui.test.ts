import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

// El panel incluye controles cliente (reintento y vínculo) que usan el router de Next.
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: () => undefined, push: () => undefined }),
}));
import { ZoomArchivoProgreso, hrefInventarioZoom } from "../src/components/zoom-archivo-progreso";
import type { PaginaInventarioZoom } from "../src/modules/archivos/ports";
import type { FiltroCategoriaZoom } from "../src/modules/archivos/domain";

const base = {
  id: "a",
  tipoOriginal: "MP4",
  variante: "gallery",
  extension: "mp4",
  estado: "CONSERVADO",
  tamanoBytes: 1048576n,
  descargable: true,
  webViewUrl: "https://drive.google.com/file/d/abc/view",
  errorCodigo: null,
} as const;

function datos(
  over: Partial<PaginaInventarioZoom["ocurrencias"][number]> = {},
  pag: Partial<PaginaInventarioZoom> = {},
): PaginaInventarioZoom {
  return {
    pagina: 1,
    totalPaginas: 1,
    totalOcurrencias: 1,
    ocurrencias: [
      {
        id: "o1",
        uuid: "u",
        titulo: "Clase <img src=x onerror=alert(1)>",
        inicioRealAt: new Date("2026-01-15T13:00:00Z"),
        anfitrionZoomId: "h",
        eventoProveedorId: null,
        inventariadoAt: null,
        procesamientoPendiente: false,
        archivos: [base],
        ...over,
      },
    ],
    ...pag,
  };
}
const html = (d: PaginaInventarioZoom, cat: FiltroCategoriaZoom = "TODOS") =>
  renderToStaticMarkup(
    createElement(ZoomArchivoProgreso, { datos: d, categoria: cat, vinculo: "TODAS" }),
  );

describe("ZoomArchivoProgreso", () => {
  it("escapa el título: nunca interpola contenido como HTML", () => {
    const h = html(datos());
    expect(h).not.toContain("<img");
    expect(h).toContain("&lt;img");
  });

  it("enlaza solo archivos conservados; el pendiente muestra su estado sin enlace", () => {
    const h = html(
      datos({
        archivos: [
          base,
          { ...base, id: "b", tipoOriginal: "CHAT", estado: "PENDIENTE", webViewUrl: null },
        ],
      }),
    );
    expect(h.match(/<a href="https:\/\/drive\.google\.com/g)).toHaveLength(1);
    expect(h).toContain("Pendiente de copia");
    expect(h).toContain("Respaldo incompleto");
  });

  it("un video conservado no declara respaldo completo si falta otro archivo; con todos sí", () => {
    expect(
      html(
        datos({ archivos: [base, { ...base, id: "b", tipoOriginal: "CHAT", estado: "COPIANDO" }] }),
      ),
    ).not.toContain("Respaldo completo");
    expect(html(datos())).toContain("Respaldo completo en Drive.");
  });

  it("tamaño parcial se declara y no se presenta como total", () => {
    const h = html(datos({ archivos: [base, { ...base, id: "b", tamanoBytes: null }] }));
    expect(h).toContain("Tamaño parcial");
    expect(h).not.toContain("Tamaño total");
  });

  it("muestra el código de error por archivo y los contadores", () => {
    const h = html(
      datos({
        archivos: [
          { ...base, estado: "REQUIERE_REVISION", errorCodigo: "RANGE_IGNORADO", webViewUrl: null },
        ],
      }),
    );
    expect(h).toContain("RANGE_IGNORADO");
    expect(h).toContain("En revisión 1");
  });

  it("estado vacío accesible y filtro por categoría sin coincidencias", () => {
    expect(html(datos({}, { ocurrencias: [], totalOcurrencias: 0 }))).toContain(
      "No hay archivos de Zoom inventariados",
    );
    expect(html(datos(), "AUDIO")).toContain("No hay archivos en esta categoría.");
  });

  it("los enlaces de navegación conservan filtros y vuelven a la página 1 al filtrar", () => {
    const actual = { zoomPagina: 3, zoomCategoria: "AUDIO", zoomVinculo: "SIN_VINCULO" } as const;
    expect(hrefInventarioZoom({ zoomPagina: 4 }, actual)).toBe(
      "/grabaciones?zoomPagina=4&zoomCategoria=AUDIO&zoomVinculo=SIN_VINCULO#archivos-zoom",
    );
    expect(
      hrefInventarioZoom({ zoomCategoria: "TODOS", zoomVinculo: "TODAS", zoomPagina: 1 }, actual),
    ).toBe("/grabaciones#archivos-zoom");
  });
});
