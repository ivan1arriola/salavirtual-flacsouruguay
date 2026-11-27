import type { AsistenciaZoomConsolidada, SesionObservadaZoom } from "../domain";

/** Lo que se leyó del encuentro al calcular; se compara al escribir para detectar una reprogramación concurrente. */
export type VersionEncuentroAsistenciaZoom = Readonly<{
  uuid: string;
  eventoProveedorId: string | null;
  inicioProgramadoAt: Date | null;
  finProgramadoAt: Date | null;
}>;

export type ResultadoPersistenciaAsistencia =
  | Readonly<{
      tipo: "GUARDADO";
      sesionesNuevas: number;
      registrosCreados: number;
      registrosActualizados: number;
    }>
  /** El encuentro, su horario o el UUID cambiaron mientras se obtenía el reporte: no se escribió nada. */
  | Readonly<{ tipo: "REPROGRAMADO" }>
  | Readonly<{ tipo: "OCURRENCIA_NO_ENCONTRADA" }>;

/** Sesiones persistidas del ámbito (todas las ocurrencias del encuentro, o solo la propia sin encuentro). */
export type SesionesDelAmbitoZoom = ReadonlyArray<
  Readonly<{ ocurrenciaId: string; sesiones: readonly SesionObservadaZoom[] }>
>;

export type ResultadoConsolidacionAsistencia =
  ResultadoPersistenciaAsistencia | Readonly<{ tipo: "SIN_VENTANA" }>;

export interface AsistenciaZoomRepositoryPort {
  /**
   * Guarda las sesiones y calcula el resumen DENTRO de la misma transacción, serializada por encuentro:
   * `consolidar` recibe todas las sesiones del ámbito (incluidas las recién insertadas y las que otra
   * sincronización concurrente haya confirmado) y devuelve el resumen, o null si no hay ventana (no se guarda nada).
   */
  guardarSesionesYConsolidar(
    ocurrenciaId: string,
    version: VersionEncuentroAsistenciaZoom,
    sesiones: readonly SesionObservadaZoom[],
    consolidar: (ambito: SesionesDelAmbitoZoom) => readonly AsistenciaZoomConsolidada[] | null,
  ): Promise<ResultadoConsolidacionAsistencia>;

  /**
   * Idempotente y solo aditivo: nunca borra sesiones ni registros (ni por un 404 ni por un lote
   * parcial) y no pisa conciliación, invitado, marca externa, notas ni versión.
   */
  guardarSesionesYResumen(
    ocurrenciaId: string,
    version: VersionEncuentroAsistenciaZoom,
    sesiones: readonly SesionObservadaZoom[],
    resumen: readonly AsistenciaZoomConsolidada[],
  ): Promise<ResultadoPersistenciaAsistencia>;
}

export type OcurrenciaParaAsistenciaZoom = Readonly<{
  ocurrenciaId: string;
  uuid: string;
  /** ID de usuario de Zoom del anfitrión de la ocurrencia (el del listado de grabaciones). */
  anfitrionZoomId: string;
  eventoProveedorId: string | null;
  inicioProgramadoAt: Date | null;
  finProgramadoAt: Date | null;
}>;

export type EstadoReporteAsistenciaZoom =
  "PENDIENTE" | "NO_DISPONIBLE" | "VACIO" | "DISPONIBLE" | "ERROR";

/** Lectura y marca de estado de la sincronización: el estado del reporte no es el de ninguna planilla. */
export interface SincronizacionAsistenciaZoomPort {
  cargarOcurrencia(ocurrenciaId: string): Promise<OcurrenciaParaAsistenciaZoom | null>;
  /** Sesiones ya persistidas de todas las ocurrencias vinculadas al mismo encuentro (o solo la propia sin encuentro). */
  listarSesionesDelAmbito(
    ocurrenciaId: string,
  ): Promise<
    ReadonlyArray<Readonly<{ ocurrenciaId: string; sesiones: readonly SesionObservadaZoom[] }>>
  >;
  marcarEstadoReporte(
    ocurrenciaId: string,
    estado: EstadoReporteAsistenciaZoom,
    codigoError: string | null,
  ): Promise<void>;
}

export type ResultadoSesionesZoom =
  /** 404: Zoom todavía no tiene el reporte. No equivale a "nadie asistió". */
  | Readonly<{ estado: "NO_DISPONIBLE" }>
  /** El reporte existe y no tiene participantes. */
  | Readonly<{ estado: "VACIO" }>
  | Readonly<{ estado: "DISPONIBLE"; sesiones: readonly SesionObservadaZoom[] }>;
