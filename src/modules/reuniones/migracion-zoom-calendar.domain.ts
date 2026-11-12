export type CambioEnlaceCalendarZoom = Readonly<{
  conferenceData: null;
  description: string;
  location?: string;
}>;

/** Prepara un cambio repetible de enlace sin borrar la ubicación de una reunión híbrida. */
export function prepararCambioEnlaceCalendarZoom<
  T extends Readonly<{ description?: string; location?: string }>
>(actual: T, meetJoinUrl: string, zoomJoinUrl: string): CambioEnlaceCalendarZoom {
  if (!meetJoinUrl || !zoomJoinUrl) {
    throw new Error("Los enlaces Meet y Zoom son obligatorios.");
  }

  const anterior = actual.description ?? "";
  const reemplazada = anterior.replaceAll(meetJoinUrl, zoomJoinUrl);
  const description = reemplazada.includes(zoomJoinUrl)
    ? reemplazada
    : `${reemplazada.trimEnd()}${reemplazada.trim() ? "\n" : ""}Acceso a Zoom: ${zoomJoinUrl}`;

  return {
    conferenceData: null,
    description,
    ...(actual.location === meetJoinUrl ? { location: zoomJoinUrl } : {})
  };
}

const ENLACE_ZOOM = /https?:\/\/[a-z0-9.-]*zoom\.(?:us|com)\/[^\s<>"')]+/gi;

/**
 * Reemplaza el enlace de Zoom de una cita por el de la reunión compartida de la serie: quita todo
 * enlace de Zoom previo (el indicado y cualquier otro) de la descripción y la ubicación, deja uno
 * solo y no toca otros campos. Repetible: aplicarlo dos veces da el mismo resultado.
 */
export function prepararCambioEnlaceZoomACalendar<
  T extends Readonly<{ description?: string; location?: string }>
>(actual: T, enlaceAnterior: string | null, enlaceNuevo: string): CambioEnlaceCalendarZoom {
  if (!enlaceNuevo) {
    throw new Error("El enlace de Zoom nuevo es obligatorio.");
  }

  // El primer enlace de Zoom pasa a ser el nuevo y los demás se quitan, para no dejar dos enlaces.
  const unificar = (texto: string) =>
    (enlaceAnterior ? texto.replaceAll(enlaceAnterior, enlaceNuevo) : texto)
      .split(ENLACE_ZOOM)
      .reduce(
        (acumulado, parte, indice) =>
          indice === 0 ? parte : `${acumulado}${indice === 1 ? enlaceNuevo : ""}${parte}`,
        ""
      );

  const unificada = unificar(actual.description ?? "");
  const description = unificada.includes(enlaceNuevo)
    ? unificada
    : `${unificada.trimEnd()}${unificada.trim() ? "\n" : ""}Acceso a Zoom: ${enlaceNuevo}`;
  const ubicacion = actual.location;
  const ubicacionZoom =
    ubicacion !== undefined &&
    ((enlaceAnterior !== null && ubicacion.includes(enlaceAnterior)) ||
      new RegExp(ENLACE_ZOOM.source, "i").test(ubicacion));

  return {
    conferenceData: null,
    description,
    ...(ubicacionZoom ? { location: enlaceNuevo } : {})
  };
}
