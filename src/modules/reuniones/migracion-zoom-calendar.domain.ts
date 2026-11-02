export type CambioEnlaceCalendarZoom = Readonly<{
  conferenceData: null;
  description: string;
  location?: string;
}>;

/** Prepara un cambio repetible de enlace sin borrar la ubicación de una reunión híbrida. */
export function prepararCambioEnlaceCalendarZoom<T extends Readonly<{ description?: string; location?: string }>>(
  actual: T,
  meetJoinUrl: string,
  zoomJoinUrl: string,
): CambioEnlaceCalendarZoom {
  if (!meetJoinUrl || !zoomJoinUrl) throw new Error("Los enlaces Meet y Zoom son obligatorios.");

  const anterior = actual.description ?? "";
  const reemplazada = anterior.replaceAll(meetJoinUrl, zoomJoinUrl);
  const description = reemplazada.includes(zoomJoinUrl)
    ? reemplazada
    : `${reemplazada.trimEnd()}${reemplazada.trim() ? "\n" : ""}Acceso a Zoom: ${zoomJoinUrl}`;

  return {
    conferenceData: null,
    description,
    ...(actual.location === meetJoinUrl ? { location: zoomJoinUrl } : {}),
  };
}
