import type { PrismaClient } from "@prisma/client";
import type { RepoMoverCarpetasZoom } from "../../application";

/** Pendientes: ocurrencias con encuentro y carpeta de Drive que aún no se verificaron bajo la raíz de vinculados. */
export function crearPrismaZoomCarpetasRepositoryAdapter(deps: Readonly<{ db: PrismaClient }>): RepoMoverCarpetasZoom {
  return {
    async listarCarpetasPorMover(limite) {
      const filas = await deps.db.ocurrenciaArchivoZoom.findMany({
        where: { eventoProveedorId: { not: null }, driveFolderId: { not: null }, carpetaVinculadaAt: null },
        orderBy: [{ vinculadaAt: "asc" }, { id: "asc" }],
        take: Math.max(1, Math.trunc(limite)),
        select: { id: true, driveFolderId: true, inicioRealAt: true }
      });
      return filas.flatMap((f) =>
        f.driveFolderId ? [{ ocurrenciaId: f.id, driveFolderId: f.driveFolderId, referencia: { inicioRealAt: f.inicioRealAt } }] : []
      );
    },

    async marcarCarpetaVinculada(ocurrenciaId, ahora) {
      // Solo si sigue vinculada: una desvinculación concurrente no debe quedar marcada como resuelta.
      const { count } = await deps.db.ocurrenciaArchivoZoom.updateMany({
        where: { id: ocurrenciaId, eventoProveedorId: { not: null }, carpetaVinculadaAt: null },
        data: { carpetaVinculadaAt: ahora }
      });
      return count === 1;
    }
  };
}
