import type { PrismaClient } from "@prisma/client";
import type { RepoAsistenciaPendienteZoom } from "../../application";

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
/** Cuánto tarda Zoom, como mínimo, en publicar el reporte de una reunión terminada. */
const ESPERA_REPORTE_MS = 15 * MIN;

/**
 * Ocurrencias cuya asistencia falta: las nunca consultadas (hasta 30 días) y las que Zoom aún no tenía o fallaron
 * (solo los últimos 3 días, con 15 min entre intentos: `updatedAt` cambia al marcar el estado del reporte).
 */
export function crearPrismaAsistenciaPendienteAdapter(
  deps: Readonly<{ db: PrismaClient }>
): RepoAsistenciaPendienteZoom {
  return {
    async listarOcurrenciasPorSincronizarAsistencia(ahora, limite) {
      const filas = await deps.db.ocurrenciaArchivoZoom.findMany({
        where: {
          OR: [
            {
              estadoAsistencia: "PENDIENTE",
              inicioRealAt: {
                gte: new Date(ahora.getTime() - 30 * DIA),
                lte: new Date(ahora.getTime() - ESPERA_REPORTE_MS)
              }
            },
            {
              estadoAsistencia: { in: ["NO_DISPONIBLE", "ERROR"] },
              inicioRealAt: { gte: new Date(ahora.getTime() - 3 * DIA) },
              updatedAt: { lte: new Date(ahora.getTime() - ESPERA_REPORTE_MS) }
            }
          ]
        },
        orderBy: [{ inicioRealAt: "desc" }, { id: "desc" }],
        take: Math.max(1, Math.trunc(limite)),
        select: { id: true }
      });
      return filas.map((f) => f.id);
    }
  };
}
