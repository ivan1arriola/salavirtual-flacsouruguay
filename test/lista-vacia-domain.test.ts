import { describe, expect, it } from "vitest";
import { mensajeListaVacia } from "../src/modules/reuniones/lista-vacia.domain";

describe("mensaje de la lista de reuniones vacía", () => {
  it("con filtros activos explica que nada coincide y ofrece limpiarlos", () => {
    expect(mensajeListaVacia({ hayFiltros: true, esHistorial: false })).toEqual({
      texto: "No hay reuniones que coincidan con los filtros.",
      accion: "LIMPIAR",
    });
    expect(mensajeListaVacia({ hayFiltros: true, esHistorial: true }).accion).toBe("LIMPIAR");
  });

  it("sin filtros y en próximas ofrece crear la primera reunión", () => {
    expect(mensajeListaVacia({ hayFiltros: false, esHistorial: false })).toEqual({
      texto: "Todavía no hay reuniones programadas.",
      accion: "CREAR",
    });
  });

  it("sin filtros y en pasadas solo informa, sin acción", () => {
    expect(mensajeListaVacia({ hayFiltros: false, esHistorial: true })).toEqual({
      texto: "Todavía no hay reuniones realizadas.",
      accion: null,
    });
  });
});
