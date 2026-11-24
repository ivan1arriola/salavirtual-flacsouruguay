import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { OtroProveedorAviso, ProveedorTabs } from "../src/components/proveedor-tabs";

const leer = (ruta: string) => readFileSync(new URL(`../${ruta}`, import.meta.url), "utf8");

describe("pestañas Meet y Zoom", () => {
  it("conserva la vista y los filtros al cambiar de proveedor", () => {
    const html = renderToStaticMarkup(
      createElement(ProveedorTabs, {
        activo: "ZOOM",
        filtros: { vista: "encuentros", q: "Brou", periodo: "anteriores" }
      })
    );
    expect(html).toContain("proveedor=meet&amp;vista=encuentros&amp;q=Brou&amp;periodo=anteriores");
  });

  it("muestra las dos pestañas y marca la activa", () => {
    const html = renderToStaticMarkup(createElement(ProveedorTabs, { activo: "ZOOM" }));
    expect(html).toContain("Meet");
    expect(html).toContain("Zoom");
    expect(html).toContain('href="/reuniones?proveedor=meet"');
    expect(html).toContain('href="/reuniones?proveedor=zoom"');
    expect(html.indexOf('href="/reuniones?proveedor=zoom"')).toBeLessThan(
      html.indexOf('href="/reuniones?proveedor=meet"')
    );
    const activa = html.match(/aria-current="page"[^>]*>[\s\S]*?<\/a>/)?.[0] ?? "";
    expect(activa).toContain("Zoom");
    expect(activa).not.toContain("Meet");
  });
});

describe("aviso de encuentros en el otro proveedor", () => {
  it("indica cuántos encuentros hay y enlaza al otro panel", () => {
    const html = renderToStaticMarkup(
      createElement(OtroProveedorAviso, {
        proveedor: "GOOGLE_MEET",
        cantidad: 3,
        href: "/reuniones/s1?proveedor=meet"
      })
    );
    expect(html).toContain("3 encuentros");
    expect(html).toContain("Meet");
    expect(html).toContain('href="/reuniones/s1?proveedor=meet"');
  });

  it("usa el singular con un solo encuentro", () => {
    const html = renderToStaticMarkup(
      createElement(OtroProveedorAviso, {
        proveedor: "ZOOM",
        cantidad: 1,
        href: "/reuniones/s1?proveedor=zoom"
      })
    );
    expect(html).toContain("1 encuentro ");
    expect(html).toContain("Zoom");
  });
});

describe("rutas de reuniones con las dos pestañas", () => {
  it("la lista elige el panel por el parámetro proveedor y abre Zoom por defecto", () => {
    expect(leer("app/(gestion)/reuniones/page.tsx")).toContain("reuniones-lista-page.server");
    const despachador = leer("src/bootstrap/ui/reuniones/reuniones-lista-page.server.tsx");
    expect(despachador).toContain("resolverProveedorReunion");
    expect(despachador).toContain("ReunionesZoomPage");
    expect(despachador).toContain("ReunionesPage");
  });

  it("ambas listas muestran las pestañas, filtran por su proveedor y conservan el parámetro en sus enlaces", () => {
    const zoom = leer("src/bootstrap/ui/reuniones/reuniones-lista-zoom-page.server.tsx");
    const meet = leer("src/bootstrap/ui/reuniones/reuniones-lista-meet-page.server.tsx");
    for (const fuente of [zoom, meet]) {
      expect(fuente).toContain("ProveedorTabs");
      expect(fuente).toContain('name="proveedor"');
    }
    expect(zoom).toContain('proveedor: "zoom"');
    expect(meet).toContain('proveedor: "meet"');
    expect(zoom).toContain('search.set("proveedor", "zoom")');
    expect(meet).toContain('search.set("proveedor", "meet")');
  });

  it("el detalle elige el panel por proveedor, filtra los encuentros y muestra el aviso", () => {
    expect(leer("app/(gestion)/reuniones/[solicitudId]/page.tsx")).toContain("reunion-detalle-page.server");
    const despachador = leer("src/bootstrap/ui/reuniones/reunion-detalle-page.server.tsx");
    expect(despachador).toContain("elegirProveedorDetalle");
    expect(despachador).toContain("ReunionZoomDetailPage");
    expect(despachador).toContain("ReunionDetailPage");
    for (const archivo of ["reunion-zoom-detail-page.server.tsx", "reunion-detail-page.server.tsx"]) {
      const fuente = leer(`src/bootstrap/ui/reuniones/${archivo}`);
      expect(fuente, archivo).toContain("proveedorActivoDeInstancia");
      expect(fuente, archivo).toContain("OtroProveedorAviso");
    }
  });
});
