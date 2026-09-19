import type { PrismaClient } from "@prisma/client";
import { enviarCorreoConfigurado } from "../configuracion/correo.service";
import {
  crearPrismaLiquidacionesRepositoryAdapter,
  enviarReportesMensualesUseCase,
  type ResultadoReportesMensuales
} from "@/src/modules/liquidaciones/api";

export type { ResultadoReportesMensuales } from "@/src/modules/liquidaciones/api";

/** Fachada de retrocompatibilidad para el reporte mensual de asistencia. */
export async function enviarReportesMensualesAsistencia(
  db: PrismaClient,
  ahora = new Date()
): Promise<ResultadoReportesMensuales> {
  return enviarReportesMensualesUseCase(
    {
      liquidacionesRepo: crearPrismaLiquidacionesRepositoryAdapter(db),
      enviarCorreo: (input) => enviarCorreoConfigurado(db, input)
    },
    ahora
  );
}
