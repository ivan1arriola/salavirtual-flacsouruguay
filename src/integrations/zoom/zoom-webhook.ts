import { createHash, createHmac, timingSafeEqual } from "node:crypto";

export const EVENTOS_ZOOM = [
  "meeting.started",
  "meeting.ended",
  "recording.completed",
  "recording.transcript_completed"
] as const;

/** Eventos en vivo que se asocian a una ejecución por cuenta + UUID (nunca solo por Meeting ID). */
export const EVENTOS_EN_VIVO: ReadonlySet<string> = new Set([
  "meeting.participant_joined",
  "meeting.participant_left",
  "meeting.participant_joined_waiting_room",
  "meeting.participant_left_waiting_room",
  "meeting.participant_admitted",
  "meeting.participant_put_in_waiting_room",
  "meeting.participant_jbh_waiting",
  "meeting.participant_jbh_waiting_left",
  "meeting.participant_role_changed",
  "meeting.participant_joined_breakout_room",
  "meeting.participant_left_breakout_room",
  "recording.started",
  "recording.stopped",
  "recording.paused",
  "recording.resumed",
  "meeting.sharing_started",
  "meeting.sharing_ended",
  "meeting.alert"
]);

export type AvisoZoom = Readonly<{
  huella: string;
  tipo: (typeof EVENTOS_ZOOM)[number];
  cuentaZoomId: string;
  meetingId: string;
  uuid: string;
  anfitrionZoomId: string;
  inicioRealAt: Date;
  finRealAt: Date | null;
  titulo: string;
  ocurridoAt: Date;
}>;

export function verificarFirmaWebhookZoom(
  secreto: string,
  cuerpo: string,
  timestamp: string | null,
  firma: string | null,
  ahora: Date
): boolean {
  if (!secreto || !timestamp || !/^\d{10}$/.test(timestamp) || !firma || !/^v0=[a-f0-9]{64}$/i.test(firma)) {
    return false;
  }
  const tiempo = Number(timestamp) * 1000;
  if (!Number.isSafeInteger(tiempo) || Math.abs(ahora.getTime() - tiempo) > 5 * 60_000) {
    return false;
  }
  const esperado = createHmac("sha256", secreto).update(`v0:${timestamp}:${cuerpo}`).digest();
  const recibido = Buffer.from(firma.slice(3), "hex");
  return recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
}

export function respuestaValidacionZoom(secreto: string, plainToken: string) {
  return {
    plainToken,
    encryptedToken: createHmac("sha256", secreto).update(plainToken).digest("hex")
  };
}

type Objeto = Record<string, unknown>;
const objeto = (valor: unknown): Objeto | null =>
  valor !== null && typeof valor === "object" && !Array.isArray(valor) ? (valor as Objeto) : null;
const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.trim() : null;
const fecha = (valor: unknown): Date | null => {
  const date = typeof valor === "string" ? new Date(valor) : null;
  return date && Number.isFinite(date.getTime()) ? date : null;
};

/** Solo los metadatos necesarios salen del cuerpo; no se guardan archivos, URLs ni personas. */
export function interpretarAvisoZoom(cuerpo: string): AvisoZoom | null {
  const raiz = objeto(JSON.parse(cuerpo) as unknown);
  const tipo = raiz?.event;
  if (!EVENTOS_ZOOM.some((evento) => evento === tipo)) {
    return null;
  }
  const payload = objeto(raiz?.payload);
  const reunion = objeto(payload?.object);
  const id = reunion?.id;
  const meetingId = typeof id === "number" && Number.isSafeInteger(id) ? String(id) : texto(id);
  const inicioRealAt = fecha(reunion?.start_time);
  const finRealAt = fecha(reunion?.end_time);
  const ocurridoAt = typeof raiz?.event_ts === "number" ? new Date(raiz.event_ts) : null;
  const cuentaZoomId = texto(payload?.account_id);
  const uuid = texto(reunion?.uuid);
  const anfitrionZoomId = texto(reunion?.host_id);
  if (
    !cuentaZoomId ||
    !meetingId ||
    !uuid ||
    !anfitrionZoomId ||
    !inicioRealAt ||
    (tipo === "meeting.ended" && !finRealAt) ||
    !ocurridoAt ||
    !Number.isFinite(ocurridoAt.getTime())
  ) {
    return null;
  }
  return {
    huella: createHash("sha256").update(cuerpo).digest("hex"),
    tipo: tipo as AvisoZoom["tipo"],
    cuentaZoomId,
    meetingId,
    uuid,
    anfitrionZoomId,
    inicioRealAt,
    finRealAt,
    titulo: texto(reunion?.topic)?.slice(0, 250) ?? "Reunión Zoom",
    ocurridoAt
  };
}

/** Conserva únicamente identificadores y fechas; nunca el contenido del webhook. */
export function interpretarAvisoAdicionalZoom(cuerpo: string) {
  const raiz = objeto(JSON.parse(cuerpo) as unknown);
  const tipo = texto(raiz?.event);
  if (!tipo || !/^(meeting|recording|group)\.[a-z0-9_]{1,100}$/.test(tipo)) {
    return null;
  }
  const payload = objeto(raiz?.payload);
  const recurso = objeto(payload?.object);
  const cuentaZoomId = texto(payload?.account_id);
  const valorId = recurso?.id ?? recurso?.meeting_number ?? recurso?.meeting_id;
  const recursoId =
    typeof valorId === "number" && Number.isSafeInteger(valorId) ? String(valorId) : texto(valorId);
  const ocurridoAt = typeof raiz?.event_ts === "number" ? new Date(raiz.event_ts) : null;
  const uuid = texto(recurso?.uuid) ?? texto(recurso?.meeting_uuid);
  const idsLote = [
    ...(Array.isArray(recurso?.meeting_uuids) ? recurso.meeting_uuids : []),
    ...(Array.isArray(recurso?.meetings) ? recurso.meetings.map((valor) => objeto(valor)?.meeting_uuid) : [])
  ];
  const uuids = [...new Set(idsLote.map(texto).filter((valor): valor is string => valor !== null))];
  if (
    !cuentaZoomId ||
    cuentaZoomId.length > 255 ||
    (recursoId && recursoId.length > 255) ||
    (uuid && uuid.length > 255) ||
    uuids.some((valor) => valor.length > 255) ||
    !ocurridoAt ||
    !Number.isFinite(ocurridoAt.getTime())
  ) {
    return null;
  }
  const participante = objeto(recurso?.participant);
  // Solo ids opacos: nombre, correo, IP y demás datos del participante jamás se leen.
  const participanteId = EVENTOS_EN_VIVO.has(tipo)
    ? (texto(participante?.participant_uuid) ??
      texto(participante?.participant_user_id) ??
      texto(participante?.user_id) ??
      texto(participante?.id))
    : null;
  // Se guardan únicamente códigos de calidad, roles y tipos de contenido; nunca nombres ni correos.
  const detalle =
    tipo === "meeting.alert" && Array.isArray(recurso?.issues)
      ? recurso.issues
          .map(texto)
          .filter((v): v is string => v !== null)
          .join(", ")
          .slice(0, 250) || null
      : tipo === "meeting.participant_role_changed"
        ? (() => {
            const anterior = texto(participante?.old_role);
            const nuevo = texto(participante?.new_role);
            const rol = (valor: string | null) =>
              valor === "host" ? "anfitrión" : valor === "co-host" ? "coanfitrión" : valor === "attendee" ? "participante" : null;
            const desde = rol(anterior);
            const hacia = rol(nuevo);
            return desde && hacia ? "Rol: " + desde + " → " + hacia : null;
          })()
        : tipo === "meeting.sharing_started"
          ? (() => {
              const sharing = objeto(participante?.sharing_details);
              const contenido = texto(sharing?.content);
              return contenido ? "Contenido: " + contenido : null;
            })()
          : null;
  if (participanteId && participanteId.length > 255) {
    return null;
  }
  return {
    huella: createHash("sha256").update(cuerpo).digest("hex"),
    tipo,
    cuentaZoomId,
    recursoId,
    uuid,
    uuids,
    participanteId,
    detalle,
    ocurridoAt
  };
}
