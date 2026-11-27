export type EjecucionZoomObservada = Readonly<{
  cuentaZoomId: string;
  uuid: string;
  inicio: Date;
  fin: Date | null;
  inicioConfirmado: boolean;
}>;

export type EstadoApiZoom = Readonly<{
  estado: "started" | "waiting" | null;
  uuid: string | null;
  salaEspera: boolean | null;
}>;

export type EstadoActualZoom = Readonly<{
  tipo: "ACTIVA" | "INICIO_SIN_VERIFICAR" | "SIN_ACTIVA" | "OTRA_EJECUCION" | "SIN_VERIFICAR";
  ejecucion: EjecucionZoomObservada | null;
  fuente: "API" | "WEBHOOK" | "SIN_DATOS";
}>;

/** El Meeting ID identifica la serie; solo cuenta + UUID acredita la ejecución del encuentro. */
export function resolverEstadoActualZoom(
  ejecuciones: readonly EjecucionZoomObservada[],
  api: EstadoApiZoom | null,
  cuentaApi: string | null,
): EstadoActualZoom {
  const ultima =
    [...ejecuciones].sort((a, b) => b.inicio.getTime() - a.inicio.getTime())[0] ?? null;
  if (api?.estado === "started") {
    const vinculada = ejecuciones.find((e) => e.uuid === api.uuid && e.cuentaZoomId === cuentaApi);
    if (vinculada) {
      return { tipo: "ACTIVA", ejecucion: vinculada, fuente: "API" };
    }
    return { tipo: "OTRA_EJECUCION", ejecucion: null, fuente: "API" };
  }
  if (api?.estado === "waiting") {
    return { tipo: "SIN_ACTIVA", ejecucion: ultima, fuente: "API" };
  }
  if (ultima?.inicioConfirmado && !ultima.fin) {
    return { tipo: "INICIO_SIN_VERIFICAR", ejecucion: ultima, fuente: "WEBHOOK" };
  }
  return { tipo: "SIN_VERIFICAR", ejecucion: ultima, fuente: "SIN_DATOS" };
}

export function etiquetaEstadoActualZoom(estado: EstadoActualZoom): string {
  switch (estado.tipo) {
    case "ACTIVA":
      return "En curso · confirmado por Zoom";
    case "INICIO_SIN_VERIFICAR":
      return "Inicio registrado · sin verificación actual";
    case "SIN_ACTIVA":
      return "Sin ejecución activa en Zoom";
    case "OTRA_EJECUCION":
      return "Zoom activo · ejecución aún no vinculada a este encuentro";
    default:
      return "Estado actual sin verificar";
  }
}
