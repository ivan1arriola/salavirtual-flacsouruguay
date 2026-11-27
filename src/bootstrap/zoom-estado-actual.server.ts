import "server-only";
import { db } from "../lib/db";
import type { EjecucionZoomObservada } from "../modules/reuniones/presentation/estado-actual-zoom";

/** No se mezclan ocurrencias de otros encuentros aunque compartan Meeting ID. */
export async function leerEjecucionesZoomActuales(
  eventoProveedorId: string,
): Promise<EjecucionZoomObservada[]> {
  const ocurrencias = await db.ocurrenciaArchivoZoom.findMany({
    where: { eventoProveedorId },
    select: { cuentaZoomId: true, uuid: true, inicioRealAt: true },
  });
  if (!ocurrencias.length) {
    return [];
  }
  const avisos = await db.eventoWebhookZoom.findMany({
    where: {
      OR: ocurrencias.map(({ cuentaZoomId, uuid }) => ({ cuentaZoomId, uuid })),
      tipo: { in: ["meeting.started", "meeting.ended"] },
    },
    select: { cuentaZoomId: true, uuid: true, tipo: true, inicioRealAt: true, finRealAt: true },
  });
  return ocurrencias.map((o) => {
    const propios = avisos.filter((a) => a.cuentaZoomId === o.cuentaZoomId && a.uuid === o.uuid);
    const inicios = propios.map((a) => a.inicioRealAt.getTime());
    const finales = propios.flatMap((a) => {
      if (a.tipo === "meeting.ended" && a.finRealAt) {
        return [a.finRealAt.getTime()];
      }
      return [];
    });
    return {
      cuentaZoomId: o.cuentaZoomId,
      uuid: o.uuid,
      inicio: inicios.length ? new Date(Math.min(...inicios)) : o.inicioRealAt,
      fin: finales.length ? new Date(Math.max(...finales)) : null,
      inicioConfirmado: propios.length > 0,
    };
  });
}
