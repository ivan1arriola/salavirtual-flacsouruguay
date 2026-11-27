import type { FilaPlanillaPago, PeriodoReporteMensual } from "../domain";

export type PlanillaPagosExporterPort = Readonly<{
  generarPlanillaPagosExcel(
    periodo: PeriodoReporteMensual,
    filas: readonly FilaPlanillaPago[],
  ): Promise<Uint8Array | Buffer>;
}>;
