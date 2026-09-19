/** Fachada temporal de compatibilidad; usar src/modules/liquidaciones/domain. */
export {
  construirCorreoReporteMensual,
  etiquetaMes,
  formatearDuracion,
  formatearHorasDecimales,
  minutosTotales,
  periodoMesAnteriorUtc3
} from "@/src/modules/liquidaciones/domain";
export type {
  CorreoReporteMensual,
  PeriodoReporteMensual
} from "@/src/modules/liquidaciones/domain";
