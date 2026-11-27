import type {
  FilaPlanillaPago,
  FilaResumenAsistente,
  PeriodoMes,
  PeriodoReporteMensual,
  ResumenAsistencia,
} from "../domain";

export type CandidatoReporteMensual = Readonly<{
  asistenteTecnicoId: string;
  usuarioId: string;
  nombre: string;
  destinatario: string | null;
  activo: boolean;
  resumen: ResumenAsistencia;
}>;

export type ReservaEnvioReporteInput = Readonly<{
  asistenteTecnicoId: string;
  periodo: string;
  destinatario: string;
  copias: readonly string[];
  resumen: ResumenAsistencia;
}>;

export type LiquidacionesRepositoryPort = Readonly<{
  obtenerFilasPlanillaPagos(periodo: PeriodoReporteMensual): Promise<readonly FilaPlanillaPago[]>;
  obtenerResumenAsistentes(periodo: PeriodoMes): Promise<readonly FilaResumenAsistente[]>;
  obtenerCandidatosReporteMensual(
    periodo: PeriodoReporteMensual,
    ahora: Date,
  ): Promise<readonly CandidatoReporteMensual[]>;
  obtenerCopiasAdministracion(): Promise<readonly string[]>;
  reservarEnvioReporte(input: ReservaEnvioReporteInput): Promise<Readonly<{ id: string }> | null>;
  marcarEnvioReporteExitoso(id: string, enviadoAt: Date): Promise<void>;
  marcarEnvioReporteError(id: string, error: string): Promise<void>;
}>;
