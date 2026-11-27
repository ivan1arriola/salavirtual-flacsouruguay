/** Fachada temporal de compatibilidad; usar src/modules/liquidaciones/domain. */
export {
  resolverPeriodoMes,
  resumirAsignacionesPorAsistente,
  resumirTotales,
} from "@/src/modules/liquidaciones/domain";
export type {
  AsignacionResumenAdministracion,
  AsistenteResumenBase,
  FilaResumenAsistente,
  MontoMoneda,
  PeriodoMes,
  TotalesResumen,
} from "@/src/modules/liquidaciones/domain";
