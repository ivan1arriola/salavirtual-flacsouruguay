import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("accesibilidad de filtros de grabaciones", () => {
  it("usa grupo de filtros y botones con estado anunciado, no pestañas simuladas", () => {
    const source = readFileSync(
      new URL("../src/components/recordings-library.tsx", import.meta.url),
      "utf8"
    );

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
});
