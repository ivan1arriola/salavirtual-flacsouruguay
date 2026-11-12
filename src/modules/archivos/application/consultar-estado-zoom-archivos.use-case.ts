import type { ZoomEstadoLecturaPort } from "../ports";

export type EstadoZoomArchivos = Readonly<{
  pendientes: number;
  conservados: number;
  enRevision: number;
  conError: number;
  /** Segundos que lleva esperando el pendiente más viejo; null si no hay. */
  antiguedadPendienteSegundos: number | null;
  /** Segundos desde la última actividad del inventario; null si nunca hubo. Un valor alto con cola indica worker detenido. */
  segundosDesdeUltimaActividad: number | null;
  fallosCapacidad: number;
  barridosActivos: number;
}>;

const segundos = (desde: Date | null, ahora: Date): number | null =>
  desde === null ? null : Math.max(0, Math.round((ahora.getTime() - desde.getTime()) / 1000));

/** Estado operativo de la conservación de archivos de Zoom: solo lectura de base de datos, sin llamar a Zoom ni a Drive. */
export async function consultarEstadoZoomArchivosUseCase(
  repo: ZoomEstadoLecturaPort,
  ahora: Date
): Promise<EstadoZoomArchivos> {
  const e = await repo.leerEstado();
  const n = (clave: string) => e.porEstado[clave] ?? 0;
  return {
    pendientes: n("PENDIENTE") + n("COPIANDO") + n("DESCUBIERTO") + n("PROCESANDO_ORIGEN"),
    conservados: n("CONSERVADO"),
    enRevision: n("REQUIERE_REVISION"),
    conError: n("ERROR_REINTENTABLE"),
    antiguedadPendienteSegundos: segundos(e.pendienteMasViejoAt, ahora),
    segundosDesdeUltimaActividad: segundos(e.ultimaActividadAt, ahora),
    fallosCapacidad: e.fallosCapacidad,
    barridosActivos: e.barridosActivos
  };
}
