import type { PeriodoReporteMensual } from "../domain";
import type { LiquidacionesRepositoryPort, PlanillaPagosExporterPort } from "../ports";

export type GenerarPlanillaPagosDeps = Readonly<{
  liquidacionesRepo: LiquidacionesRepositoryPort;
  exporter: PlanillaPagosExporterPort;
}>;

export async function generarPlanillaPagosUseCase(
  deps: GenerarPlanillaPagosDeps,
  periodo: PeriodoReporteMensual,
): Promise<Uint8Array | Buffer> {
  const filas = await deps.liquidacionesRepo.obtenerFilasPlanillaPagos(periodo);
  return deps.exporter.generarPlanillaPagosExcel(periodo, filas);
}
