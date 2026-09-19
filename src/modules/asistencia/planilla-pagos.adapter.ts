import type { PrismaClient } from "@prisma/client";
import { crearPrismaLiquidacionesRepositoryAdapter } from "@/src/modules/liquidaciones/api";
import type { FilaPlanillaPago, PeriodoReporteMensual } from "@/src/modules/liquidaciones/presentation";

export type { FilaPlanillaPago } from "@/src/modules/liquidaciones/presentation";

/** Fachada temporal de compatibilidad para la consulta de pagos. */
export function obtenerFilasPlanillaPagos(
  db: PrismaClient,
  periodo: PeriodoReporteMensual
): Promise<readonly FilaPlanillaPago[]> {
  return crearPrismaLiquidacionesRepositoryAdapter(db).obtenerFilasPlanillaPagos(periodo);
}
