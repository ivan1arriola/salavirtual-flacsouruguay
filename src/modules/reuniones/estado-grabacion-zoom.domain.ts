export type EstadoGrabacionZoomFicha =
  | "NO_PREVISTA"
  | "SIN_CONFIRMAR"
  | "PROCESANDO"
  | "SINCRONIZANDO"
  | "DISPONIBLE";

export const ETIQUETA_GRABACION_ZOOM: Record<EstadoGrabacionZoomFicha, string> = {
  NO_PREVISTA: "No prevista",
  SIN_CONFIRMAR: "Sin confirmar",
  PROCESANDO: "Procesando en Zoom",
  SINCRONIZANDO: "Sincronizando con Drive",
  DISPONIBLE: "Disponible en Drive"
};

/**
 * Distingue «no hay grabación» (no se esperaba), «aún no sabemos» (se esperaba y no hay rastro) y los
 * estados intermedios. `url` solo existe cuando el archivo ya está en Drive.
 */
export function derivarEstadoGrabacionZoomFicha(
  entrada: Readonly<{
    requiereGrabacion: boolean;
    ocurrencias: readonly Readonly<{
      pendiente: boolean;
      archivos: readonly Readonly<{ url: string | null }>[];
    }>[];
  }>
): EstadoGrabacionZoomFicha {
  const archivos = entrada.ocurrencias.flatMap((o) => o.archivos);
  if (archivos.some(({ url }) => url !== null)) {
    return "DISPONIBLE";
  }
  if (entrada.ocurrencias.some((o) => o.pendiente)) {
    return "PROCESANDO";
  }
  if (archivos.length > 0) {
    return "SINCRONIZANDO";
  }
  return entrada.requiereGrabacion ? "SIN_CONFIRMAR" : "NO_PREVISTA";
}
