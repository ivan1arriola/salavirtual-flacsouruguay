import { crearExceljsPlanillaPagosAdapter } from "@/src/modules/liquidaciones/api";
import type {
  FilaPlanillaPago,
  PeriodoReporteMensual,
} from "@/src/modules/liquidaciones/presentation";

/** Fachada temporal de compatibilidad para el exportador Excel. */
export async function crearPlanillaPagos(
  filas: readonly FilaPlanillaPago[],
  periodo: PeriodoReporteMensual,
): Promise<Buffer> {
  const data = await crearExceljsPlanillaPagosAdapter().generarPlanillaPagosExcel(periodo, filas);
  return Buffer.from(data);
}
