export type AccionListaVacia = "LIMPIAR" | "CREAR" | null;

/** Qué decirle a quien ve la lista de reuniones sin resultados, y qué puede hacer a continuación. */
export function mensajeListaVacia(
  contexto: Readonly<{ hayFiltros: boolean; esHistorial: boolean }>,
): Readonly<{ texto: string; accion: AccionListaVacia }> {
  if (contexto.hayFiltros) {
    return { texto: "No hay reuniones que coincidan con los filtros.", accion: "LIMPIAR" };
  }
  return contexto.esHistorial
    ? { texto: "Todavía no hay reuniones realizadas.", accion: null }
    : { texto: "Todavía no hay reuniones programadas.", accion: "CREAR" };
}
