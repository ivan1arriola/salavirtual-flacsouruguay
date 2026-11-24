/** Fachada temporal de compatibilidad; usar src/modules/liquidaciones/domain. */
export {
  resolverPeriodoMes,
  resumirAsignacionesPorAsistente,
  resumirTotales
} from "@/src/modules/liquidaciones/domain";
export type { MontoMoneda, PeriodoMes } from "@/src/modules/liquidaciones/domain";
