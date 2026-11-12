import type { PrismaClient } from "@prisma/client";
import type { ZoomEstadoLecturaPort } from "../../ports";

/** Códigos de error por permiso o capacidad (scope faltante, rechazo de Drive): exigen acción de administración. */
const CODIGOS_CAPACIDAD = ["CAPACIDAD_PENDIENTE", "SOLICITUD_RECHAZADA"];

export function crearPrismaZoomEstadoLecturaAdapter(
  deps: Readonly<{ db: PrismaClient }>
): ZoomEstadoLecturaPort {
  const { db } = deps;
  return {
    async leerEstado() {
      const [grupos, viejo, actividad, capacidad, barridos] = await Promise.all([
        db.archivoOrigenZoom.groupBy({ by: ["estado"], _count: { _all: true } }),
        db.archivoOrigenZoom.findFirst({
          where: { estado: "PENDIENTE" },
          orderBy: { createdAt: "asc" },
          select: { createdAt: true }
        }),
        db.archivoOrigenZoom.aggregate({ _max: { updatedAt: true } }),
        db.archivoOrigenZoom.count({
          where: {
            estado: { in: ["ERROR_REINTENTABLE", "REQUIERE_REVISION"] },
            errorCodigo: { in: CODIGOS_CAPACIDAD }
          }
        }),
        db.barridoArchivoZoom.count({
          where: { estado: { in: ["PENDIENTE", "EN_CURSO", "ERROR_REINTENTABLE"] } }
        })
      ]);
      return {
        porEstado: Object.fromEntries(grupos.map((g) => [g.estado, g._count._all])),
        pendienteMasViejoAt: viejo?.createdAt ?? null,
        fallosCapacidad: capacidad,
        ultimaActividadAt: actividad._max.updatedAt ?? null,
        barridosActivos: barridos
      };
    }
  };
}
