import type { Prisma } from "@prisma/client";
import { PREFIJO_REFERENCIA_ARCHIVO_ZOOM } from "../../domain";

/**
 * Predicado compartido de los consumidores existentes de la biblioteca Meet: excluye las
 * referencias locales creadas desde el inventario Zoom (`externalResourceName` con el
 * prefijo `zoom/`) hasta que la entrega B las muestre con su proveedor real.
 */
export function filtroArchivoReunionMeet(): Prisma.ArchivoReunionWhereInput {
  return { NOT: { externalResourceName: { startsWith: PREFIJO_REFERENCIA_ARCHIVO_ZOOM } } };
}
