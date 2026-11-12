import type { Prisma, PrismaClient } from "@prisma/client";
import type { ZoomInventarioLecturaPort } from "../../ports";

const POR_PAGINA = 12;

/** Lectura de solo consulta: nunca selecciona URLs de descarga, sesiones de subida ni claves de origen. */
export function crearPrismaZoomInventarioLecturaAdapter(
  deps: Readonly<{ db: PrismaClient }>
): ZoomInventarioLecturaPort {
  return {
    async listarInventario({ pagina, vinculo }) {
      const where: Prisma.OcurrenciaArchivoZoomWhereInput = {
        archivos: { some: {} },
        ...(vinculo === "SIN_VINCULO" ? { eventoProveedorId: null } : {})
      };
      const total = await deps.db.ocurrenciaArchivoZoom.count({ where });
      const totalPaginas = Math.max(1, Math.ceil(total / POR_PAGINA));
      const actual = Math.min(Math.max(1, pagina), totalPaginas);
      const filas = await deps.db.ocurrenciaArchivoZoom.findMany({
        where,
        orderBy: [{ inicioRealAt: "desc" }, { id: "desc" }],
        skip: (actual - 1) * POR_PAGINA,
        take: POR_PAGINA,
        select: {
          id: true,
          uuid: true,
          titulo: true,
          inicioRealAt: true,
          anfitrionZoomId: true,
          eventoProveedorId: true,
          inventariadoAt: true,
          procesamientoPendiente: true,
          archivos: {
            orderBy: [{ coleccion: "asc" }, { tipoOriginal: "asc" }, { id: "asc" }],
            select: {
              id: true,
              tipoOriginal: true,
              variante: true,
              extension: true,
              estado: true,
              tamanoBytes: true,
              descargable: true,
              webViewUrl: true,
              errorCodigo: true
            }
          }
        }
      });
      return { pagina: actual, totalPaginas, totalOcurrencias: total, ocurrencias: filas };
    }
  };
}
