import type { PrismaClient } from "@prisma/client";
import type { RepoAsistenciaPendienteZoom } from "../../application";

const MIN = 60_000;
const DIA = 24 * 60 * MIN;
/** Cuánto tarda Zoom, como mínimo, en publicar el reporte de una reunión terminada. */
const ESPERA_REPORTE_MS = 15 * MIN;

/**
 * El reporte puede llegar tarde. Revisamos hasta un año: cada 15 min para las recientes y una vez al día
 * para reintentos antiguos, sin dejar que un error permanente bloquee otras ocurrencias.
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
                gte: new Date(ahora.getTime() - 365 * DIA),
                lte: new Date(ahora.getTime() - ESPERA_REPORTE_MS)
              }
            },
            {
              estadoAsistencia: { in: ["NO_DISPONIBLE", "ERROR"] },
              inicioRealAt: { gte: new Date(ahora.getTime() - 3 * DIA) },
              updatedAt: { lte: new Date(ahora.getTime() - ESPERA_REPORTE_MS) }
            },
            {
              estadoAsistencia: { in: ["NO_DISPONIBLE", "ERROR"] },
              inicioRealAt: {
                gte: new Date(ahora.getTime() - 365 * DIA),
                lt: new Date(ahora.getTime() - 3 * DIA)
              },
              updatedAt: { lte: new Date(ahora.getTime() - DIA) }
            }
          ]
        },
        orderBy: [{ updatedAt: "asc" }, { id: "asc" }],
        take: Math.max(1, Math.trunc(limite)),
        select: { id: true }
      });
      return filas.map((f) => f.id);
    }
  };
}
