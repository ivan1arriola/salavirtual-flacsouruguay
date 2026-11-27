import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { OperationalAttendeeDatabaseManager } from "../src/components/operational-remote-control";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

describe("filtros de asistentes operativos", () => {
  it("comunica el filtro seleccionado como botón presionado", () => {
    const html = renderToStaticMarkup(
      createElement(OperationalAttendeeDatabaseManager, {
        instanciaId: "i1",
        asistentes: [],
        enGruposPequenos: false,
        cantidadGruposPequenos: 0,
        ahoraIso: "2026-01-01T00:00:00Z",
      }),
    );
    expect(html).toContain('role="group" aria-label="Filtrar asistentes"');
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>[\s\S]*?Conectados ahora/);
    expect(html).toMatch(/<button[^>]*aria-pressed="false"[^>]*>[\s\S]*?Todos/);
    expect(html).not.toContain('role="tablist"');
  });
});
