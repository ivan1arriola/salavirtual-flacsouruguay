import type { PrismaClient } from "@prisma/client";
import type { OcurrenciaCarpetaZoom, RepoOrdenarCarpetasZoom } from "../../application";

/**
 * Las carpetas ordenadas antes de este corte siguen el formato anterior (AAAA/MM/ocurrencia) y se
 * reordenan una vez, con el formato `AAAAMMDD - Tema` (y `Grabación N` cuando hay varias).
 */
export const CORTE_FORMATO_CARPETAS_ZOOM = new Date("2026-11-14T00:00:00.000Z");
const VENTANA_CERCANA_MS = 36 * 60 * 60 * 1000;

const seleccion = {
  id: true,
  driveFolderId: true,
  inicioRealAt: true,
  titulo: true,
  eventoProveedor: {
    select: { instancia: { select: { solicitud: { select: { titulo: true } } } } },
  },
} as const;

type Fila = {
  id: string;
  driveFolderId: string | null;
  inicioRealAt: Date;
  titulo: string;
  eventoProveedor: { instancia: { solicitud: { titulo: string } | null } | null } | null;
};

function aOcurrencia(f: Fila): OcurrenciaCarpetaZoom[] {
  return f.driveFolderId
    ? [
        {
          ocurrenciaId: f.id,
          driveFolderId: f.driveFolderId,
          inicioRealAt: f.inicioRealAt,
          titulo: f.eventoProveedor?.instancia?.solicitud?.titulo ?? f.titulo,
        },
      ]
    : [];
}

/** Ocurrencias con encuentro y carpeta de Drive cuya carpeta aún no se ordenó con el formato vigente. */
export function crearPrismaZoomCarpetasRepositoryAdapter(
  deps: Readonly<{ db: PrismaClient }>,
): RepoOrdenarCarpetasZoom {
  return {
    async listarPendientes(limite) {
      const filas = await deps.db.ocurrenciaArchivoZoom.findMany({
        where: {
          eventoProveedorId: { not: null },
          driveFolderId: { not: null },
          OR: [
            { carpetaVinculadaAt: null },
            { carpetaVinculadaAt: { lt: CORTE_FORMATO_CARPETAS_ZOOM } },
          ],
        },
        orderBy: [{ vinculadaAt: "asc" }, { id: "asc" }],
        take: Math.max(1, Math.trunc(limite)),
        select: seleccion,
      });
      return filas.flatMap(aOcurrencia);
    },

    async listarVinculadasCercanas(referencia) {
      const filas = await deps.db.ocurrenciaArchivoZoom.findMany({
        where: {
          eventoProveedorId: { not: null },
          driveFolderId: { not: null },
          inicioRealAt: {
            gte: new Date(referencia.getTime() - VENTANA_CERCANA_MS),
            lte: new Date(referencia.getTime() + VENTANA_CERCANA_MS),
          },
        },
        orderBy: [{ inicioRealAt: "asc" }, { id: "asc" }],
        select: seleccion,
      });
      return filas.flatMap(aOcurrencia);
    },

    async marcarCarpetaVinculada(ocurrenciaId, ahora) {
      // Solo si sigue vinculada: una desvinculación concurrente no debe quedar marcada como resuelta.
      const { count } = await deps.db.ocurrenciaArchivoZoom.updateMany({
        where: { id: ocurrenciaId, eventoProveedorId: { not: null } },
        data: { carpetaVinculadaAt: ahora },
      });
      return count === 1;
    },
  };
}
