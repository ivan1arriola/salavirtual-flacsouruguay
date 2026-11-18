export type EstadoGrabacionZoomFicha =
  "NO_PREVISTA" | "SIN_CONFIRMAR" | "PROCESANDO" | "SINCRONIZANDO" | "DISPONIBLE" | "REQUIERE_ATENCION";

export const ETIQUETA_GRABACION_ZOOM: Record<EstadoGrabacionZoomFicha, string> = {
  NO_PREVISTA: "No prevista",
  SIN_CONFIRMAR: "Sin confirmar",
  PROCESANDO: "Procesando en Zoom",
  SINCRONIZANDO: "Sincronizando con Drive",
  DISPONIBLE: "Disponible en Drive",
  REQUIERE_ATENCION: "Requiere atención"
};

export type EstadoArchivoGrabacionZoom =
  | "PENDIENTE"
  | "PROCESANDO_ZOOM"
  | "DISPONIBLE_ZOOM"
  | "SINCRONIZANDO"
  | "DISPONIBLE_DRIVE"
  | "ERROR_REINTENTABLE"
  | "REQUIERE_REVISION";

export const ETIQUETA_ARCHIVO_GRABACION_ZOOM: Record<EstadoArchivoGrabacionZoom, string> = {
  PENDIENTE: "Pendiente",
  PROCESANDO_ZOOM: "Procesando en Zoom",
  DISPONIBLE_ZOOM: "Disponible en Zoom",
  SINCRONIZANDO: "Sincronizando con Drive",
  DISPONIBLE_DRIVE: "Disponible en Drive",
  ERROR_REINTENTABLE: "Error, se reintentará",
  REQUIERE_REVISION: "Requiere revisión"
};

/** Traduce EstadoArchivoZoom; un estado desconocido no se afirma como bueno: queda pendiente. */
export function estadoArchivoGrabacionZoom(estado: string): EstadoArchivoGrabacionZoom {
  switch (estado) {
    case "DESCUBIERTO":
      return "DISPONIBLE_ZOOM";
    case "PROCESANDO_ORIGEN":
      return "PROCESANDO_ZOOM";
    case "COPIANDO":
      return "SINCRONIZANDO";
    case "CONSERVADO":
      return "DISPONIBLE_DRIVE";
    case "ERROR_REINTENTABLE":
    case "REQUIERE_REVISION":
      return estado;
    default:
      return "PENDIENTE";
  }
}

/**
 * Distingue «no hay grabación» (no se esperaba), «aún no sabemos» (se esperaba y no hay rastro) y los
 * estados intermedios. `url` solo existe cuando el archivo ya está en Drive.
 */
export function derivarEstadoGrabacionZoomFicha(
  entrada: Readonly<{
    requiereGrabacion: boolean;
    ocurrencias: readonly Readonly<{
      pendiente: boolean;
      archivos: readonly Readonly<{ url: string | null; estado?: EstadoArchivoGrabacionZoom }>[];
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
    return archivos.every(({ estado }) => estado === "ERROR_REINTENTABLE" || estado === "REQUIERE_REVISION")
      ? "REQUIERE_ATENCION"
      : "SINCRONIZANDO";
  }
  return entrada.requiereGrabacion ? "SIN_CONFIRMAR" : "NO_PREVISTA";
}
