import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const leer = (ruta: string) => readFileSync(ruta, "utf8");

describe("ficha histórica de Zoom: accesibilidad y responsive", () => {
  const ficha = leer("src/bootstrap/ui/reuniones/reunion-zoom-historica.tsx");
  const css = leer("src/bootstrap/ui/reuniones/reunion-zoom-operativa.module.css");

  it("navegación con nombre y página actual, e identificación presente", () => {
    expect(ficha).toMatch(/<nav[^>]*aria-label=/);
    expect(ficha).toMatch(/aria-current=/);
    expect(ficha).toMatch(/aria-labelledby="zoom-identificacion"/);
  });

  it("textos: sin 'Incidencias' ni 'Consultar grabaciones', con 'Ver serie completa de Zoom'", () => {
    expect(ficha).not.toMatch(/Incidencias/);
    expect(ficha).not.toMatch(/Consultar grabaciones/);
    expect(ficha).toMatch(/Ver serie completa de Zoom/);
  });

  it("hay regla móvil (máx 640px) con objetivos táctiles de 44px", () => {
    const bloque = css.slice(css.indexOf("@media (max-width: 640px)"));
    expect(bloque).toMatch(/min-height: 44px/);
  });
});

describe("conciliación de asistencia Zoom: accesibilidad y responsive", () => {
  const comp = leer("src/components/zoom-asistencia-conciliacion.tsx");
  const css = leer("app/(gestion)/attendance-view.css");

  it("participantes como tarjetas details/summary", () => {
    expect(comp).toMatch(/<details className="zoom-person"/);
    expect(comp).toMatch(/<summary>/);
  });

  it("regla móvil (máx 640px) con controles de 44px", () => {
    const bloque = css.slice(css.indexOf("@media (max-width: 640px)"));
    expect(bloque).toMatch(/\.zoom-person__body[^{]*\{\s*min-height: 44px|:is\(select, button\)\s*\{\s*min-height: 44px/);
  });
});
