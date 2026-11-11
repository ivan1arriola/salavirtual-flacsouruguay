export type EstadoCrudoZoomArchivos = Readonly<{
  /** Cantidad de archivos por estado (EstadoArchivoZoom). */
  porEstado: Readonly<Record<string, number>>;
  /** Archivo PENDIENTE (listo para copiar) más antiguo; null si no hay. */
  pendienteMasViejoAt: Date | null;
  /** Archivos con fallo por falta de permiso/capacidad en Zoom o Drive. */
  fallosCapacidad: number;
  /** Última modificación de cualquier archivo del inventario: señal de actividad del worker. */
  ultimaActividadAt: Date | null;
  barridosActivos: number;
}>;

export interface ZoomEstadoLecturaPort {
  leerEstado(): Promise<EstadoCrudoZoomArchivos>;
}
