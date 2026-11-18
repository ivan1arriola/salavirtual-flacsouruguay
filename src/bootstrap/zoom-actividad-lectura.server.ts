import { db } from "../lib/db";
import {
  construirActividadEncuentroZoom,
  type EntradaActividadZoom
} from "../modules/reuniones/presentation/actividad-encuentro-zoom";

const TOPE_AVISOS = 2000;

/**
 * Actividad confirmada por webhooks para las ejecuciones (cuenta + UUID) vinculadas a un encuentro.
 * Nunca asocia por Meeting ID: una serie comparte ese número entre muchas ejecuciones.
 */
export async function leerActividadEncuentroZoom(eventoProveedorId: string): Promise<EntradaActividadZoom[]> {
  const ocurrencias = await db.ocurrenciaArchivoZoom.findMany({
    where: { eventoProveedorId },
    select: { cuentaZoomId: true, uuid: true }
  });
  if (ocurrencias.length === 0) {
    return [];
  }
  const claves = ocurrencias.map(({ cuentaZoomId, uuid }) => ({ cuentaZoomId, uuid }));
  const [principales, adicionales] = await Promise.all([
    db.eventoWebhookZoom.findMany({
      where: { OR: claves },
      orderBy: { ocurridoAt: "desc" },
      take: TOPE_AVISOS,
      select: { tipo: true, ocurridoAt: true }
    }),
    db.eventoWebhookZoomAdicional.findMany({
      where: { OR: claves.flatMap((clave) => [clave, { cuentaZoomId: clave.cuentaZoomId, uuids: { has: clave.uuid } }]) },
      orderBy: { ocurridoAt: "desc" },
      take: TOPE_AVISOS,
      select: { tipo: true, ocurridoAt: true }
    })
  ]);
  return construirActividadEncuentroZoom([...principales, ...adicionales]);
}
