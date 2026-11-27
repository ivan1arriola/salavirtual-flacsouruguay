export type VistaTemporalEncuentros = "TODOS" | "PROXIMOS" | "PASADOS";

export type EncuentroFiltrable = Readonly<{
  temporalidad: "PASADO" | "EN_CURSO" | "FUTURO";
  esDeHoy: boolean;
}>;

export function perteneceAVistaTemporal(
  encuentro: EncuentroFiltrable,
  vista: VistaTemporalEncuentros,
): boolean {
  const esPasadoAnterior = encuentro.temporalidad === "PASADO" && !encuentro.esDeHoy;
  if (vista === "TODOS") {
    return true;
  }
  return vista === "PASADOS" ? esPasadoAnterior : !esPasadoAnterior;
}

export function filtrarEncuentrosPorVista<T extends EncuentroFiltrable>(
  encuentros: readonly T[],
  vista: VistaTemporalEncuentros,
): readonly T[] {
  return encuentros.filter((encuentro) => perteneceAVistaTemporal(encuentro, vista));
}
