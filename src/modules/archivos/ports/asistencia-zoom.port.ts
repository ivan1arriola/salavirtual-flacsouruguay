import type { AsistenciaZoomConsolidada, SesionObservadaZoom } from "../domain";

/** Lo que se leyó del encuentro al calcular; se compara al escribir para detectar una reprogramación concurrente. */
export type VersionEncuentroAsistenciaZoom = Readonly<{
  uuid: string;
  eventoProveedorId: string | null;
  inicioProgramadoAt: Date | null;
  finProgramadoAt: Date | null;
}>;

export type ResultadoPersistenciaAsistencia =
  | Readonly<{ tipo: "GUARDADO"; sesionesNuevas: number; registrosCreados: number; registrosActualizados: number }>
  /** El encuentro, su horario o el UUID cambiaron mientras se obtenía el reporte: no se escribió nada. */
  | Readonly<{ tipo: "REPROGRAMADO" }>
  | Readonly<{ tipo: "OCURRENCIA_NO_ENCONTRADA" }>;

export interface AsistenciaZoomRepositoryPort {
  /**
   * Idempotente y solo aditivo: nunca borra sesiones ni registros (ni por un 404 ni por un lote
   * parcial) y no pisa conciliación, invitado, marca externa, notas ni versión.
   */
  guardarSesionesYResumen(
    ocurrenciaId: string,
    version: VersionEncuentroAsistenciaZoom,
    sesiones: readonly SesionObservadaZoom[],
    resumen: readonly AsistenciaZoomConsolidada[]
  ): Promise<ResultadoPersistenciaAsistencia>;
}
