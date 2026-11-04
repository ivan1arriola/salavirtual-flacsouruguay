import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const control = readFileSync(new URL("../src/components/migracion-zoom-serie-control.tsx", import.meta.url), "utf8");
const pagina = readFileSync(new URL("../app/(gestion)/reuniones/migracion-zoom/page.tsx", import.meta.url), "utf8");

describe("pantalla de migración por serie", () => {
  it("aplica por serie contra la ruta de series y limita la selección a 5", () => {
    expect(control).toContain("/api/v1/reuniones/migracion-zoom/series/aplicar");
    expect(control).toContain("serieClaves: claves");
    expect(control).toContain("const MAXIMO_SERIES = 5;");
    expect(control).not.toContain("instanciaIds");
  });

  it("solo permite seleccionar series migrables", () => {
    expect(control).toContain('const migrable = fila.estado === "MIGRABLE";');
    expect(control).toContain("{migrable ? (");
  });

  it("el diálogo se cierra con Escape, retiene el foco y lo devuelve al botón que lo abrió", () => {
    expect(control).toContain('event.key === "Escape"');
    expect(control).toContain('event.key !== "Tab"');
    expect(control).toContain("disparador?.focus()");
    expect(control).toContain('aria-modal="true"');
  });

  it("anuncia los errores y permite marcar la excepción por encuentro", () => {
    expect(control).toContain('role="alert"');
    expect(control).toContain("<ExcepcionMeetControl");
  });

  it("la página usa siempre la pantalla por serie", () => {
    expect(pagina).not.toContain("reunionCompartidaHabilitada");
    expect(pagina).toContain("<MigracionZoomSerieControl");
    expect(pagina).not.toContain("<MigracionZoomAplicarControl");
  });
});
