import { db } from "../lib/db";
import {
  construirActividadEncuentroZoom,
  type EntradaActividadZoom
} from "../modules/reuniones/presentation/actividad-encuentro-zoom";

// Los hitos (inicio, grabación, pantalla, alertas, fin) tienen su propio tope: si compartieran el de las
// entradas y salidas, una reunión muy concurrida desplazaría justamente los hitos más antiguos (el inicio).
const TOPE_HITOS = 1000;
const TOPE_PARTICIPANTES = 5000;
const TIPOS_PARTICIPANTE = [
  "meeting.participant_joined",
  "meeting.participant_left",
  "meeting.participant_joined_waiting_room",
  "meeting.participant_left_waiting_room",
  "meeting.participant_admitted",
  "meeting.participant_put_in_waiting_room"
];

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
  const donde = claves.flatMap((clave) => [
    clave,
    { cuentaZoomId: clave.cuentaZoomId, uuids: { has: clave.uuid } }
  ]);
  const seleccion = { tipo: true, ocurridoAt: true } as const;
  const [principales, hitos, participantes] = await Promise.all([
    db.eventoWebhookZoom.findMany({
      where: { OR: claves },
      orderBy: { ocurridoAt: "desc" },
      take: TOPE_HITOS,
      select: seleccion
    }),
    db.eventoWebhookZoomAdicional.findMany({
      where: { OR: donde, tipo: { notIn: TIPOS_PARTICIPANTE } },
      orderBy: { ocurridoAt: "desc" },
      take: TOPE_HITOS,
      select: seleccion
    }),
    db.eventoWebhookZoomAdicional.findMany({
      where: { OR: donde, tipo: { in: TIPOS_PARTICIPANTE } },
      orderBy: { ocurridoAt: "desc" },
      take: TOPE_PARTICIPANTES,
      select: seleccion
    })
  ]);
  return construirActividadEncuentroZoom([...principales, ...hitos, ...participantes]);
}
