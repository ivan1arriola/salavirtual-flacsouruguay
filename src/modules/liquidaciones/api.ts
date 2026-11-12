export * from "./domain";
export * from "./ports";
export * from "./application";
export * from "./infrastructure";

import type { ModalidadAsistencia, PeriodoMes, PeriodoReporteMensual } from "./domain";
import type { LiquidacionesRepositoryPort, PlanillaPagosExporterPort, TarifasRepositoryPort } from "./ports";
import {
  consultarResumenAsistentesUseCase,
  consultarTarifaVigenteUseCase,
  enviarReportesMensualesUseCase,
  generarPlanillaPagosUseCase
} from "./application";

export type ServicioLiquidacionesDeps = Readonly<{
  liquidacionesRepo: LiquidacionesRepositoryPort;
  tarifasRepo: TarifasRepositoryPort;
  exporter: PlanillaPagosExporterPort;
  enviarCorreo: (
    input: Readonly<{
      to: readonly string[];
      cc: readonly string[];
      subject: string;
      text: string;
      html: string;
    }>
  ) => Promise<Readonly<{ sent: boolean; skipped?: string }>>;
}>;

export function crearServicioLiquidaciones(deps: ServicioLiquidacionesDeps) {
  return {
    consultarTarifaVigente(modalidad: ModalidadAsistencia) {
      return consultarTarifaVigenteUseCase({ tarifasRepo: deps.tarifasRepo }, modalidad);
    },
    generarPlanillaPagos(periodo: PeriodoReporteMensual) {
      return generarPlanillaPagosUseCase(
        { liquidacionesRepo: deps.liquidacionesRepo, exporter: deps.exporter },
        periodo
      );
    },
    consultarResumenAsistentes(periodo: PeriodoMes) {
      return consultarResumenAsistentesUseCase({ liquidacionesRepo: deps.liquidacionesRepo }, periodo);
    },
    enviarReportesMensuales(ahora?: Date) {
      return enviarReportesMensualesUseCase(
        { liquidacionesRepo: deps.liquidacionesRepo, enviarCorreo: deps.enviarCorreo },
        ahora
      );
    }
  };
}

export type ServicioLiquidaciones = ReturnType<typeof crearServicioLiquidaciones>;
