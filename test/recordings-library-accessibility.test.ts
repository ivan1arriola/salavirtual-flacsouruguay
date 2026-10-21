import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("../src/components/recordings-library.tsx", import.meta.url),
  "utf8"
);
const stylesheet = readFileSync(
  new URL("../app/(gestion)/grabaciones/grabaciones.css", import.meta.url),
  "utf8"
);

describe("accesibilidad de filtros de grabaciones", () => {
  it("usa grupo de filtros y botones con estado anunciado, no pestañas simuladas", () => {
    expect(source).toContain('role="group" aria-label="Filtrar por tipo de archivo"');
    expect(source).toContain("aria-pressed={filtro === \"TODOS\"}");
    expect(source).toContain("aria-pressed={filtro === \"GRABACIONES\"}");
    expect(source).toContain("aria-pressed={filtro === \"ASISTENCIAS\"}");
    expect(source).toContain("aria-pressed={filtro === \"NOTAS_Y_TRANSCRIPCIONES\"}");
    expect(source).toContain('type="search"');
    expect(source).not.toContain('role="tablist"');
    expect(source).not.toContain('role="tab"');
    expect(source).not.toContain("aria-selected=");
  });

  it("mantiene objetivos táctiles de 44px y paginación adaptable en móvil", () => {
    expect(stylesheet).toMatch(/\.filter-tab\s*\{[^}]*min-height:\s*44px/s);
    expect(stylesheet).toMatch(/\.clear-search-button\s*\{[^}]*width:\s*44px;[^}]*height:\s*44px/s);
    expect(stylesheet).toMatch(/\.recording-file-open\s*\{[^}]*min-height:\s*44px/s);
    expect(stylesheet).toMatch(/\.reset-filters-button\s*\{[^}]*min-height:\s*44px/s);
    expect(source).toContain('className="recordings-pagination"');
    expect(stylesheet).toMatch(/\.recordings-pagination\s*\{[^}]*display:\s*grid/s);
  });

  it("ofrece una sola acción administrativa para revisar y reparar todas las hojas vacías", () => {
    expect(source).toContain("Reparar planillas vacías");
    expect(source).toContain("/api/v1/asistencia/planillas-vacias");
    expect(source).toContain('role="status"');
    expect(source).toContain("Reintentar solo las fallidas");
    expect(source).toContain("Ver detalles técnicos por encuentro");
    expect(source).toContain("Revisar permisos de Google Workspace");
  });
});
