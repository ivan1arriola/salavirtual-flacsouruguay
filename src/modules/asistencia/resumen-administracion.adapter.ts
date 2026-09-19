import type { PrismaClient } from "@prisma/client";
import { crearPrismaLiquidacionesRepositoryAdapter } from "@/src/modules/liquidaciones/api";
import type { FilaResumenAsistente, PeriodoMes } from "@/src/modules/liquidaciones/presentation";

/** Fachada temporal de compatibilidad para el resumen administrativo. */
export function obtenerResumenAsistentes(
  db: PrismaClient,
  periodo: PeriodoMes
): Promise<readonly FilaResumenAsistente[]> {
  return crearPrismaLiquidacionesRepositoryAdapter(db).obtenerResumenAsistentes(periodo);
}
