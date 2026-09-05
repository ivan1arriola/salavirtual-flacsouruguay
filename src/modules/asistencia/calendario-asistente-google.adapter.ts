import { JWT } from "google-auth-library";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const GOOGLE_HTTP_TIMEOUT_MS = 60_000;

export type EventoCalendarioAsistente = Readonly<{
  id: string;
  titulo: string;
  descripcion: string | null;
  inicio: Date;
  fin: Date;
  timezone: string;
  instanciaSalaId: string;
  programa: string | null;
  docente: string | null;
  joinUrl: string | null;
}>;

export async function publicarEventoCalendarioAsistente(
  credentials: GoogleCalendarCredentials,
  event: EventoCalendarioAsistente,
): Promise<void> {
  const auth = crearAuth(credentials);
  const eventsUrl = `${CALENDAR_API}/calendars/primary/events`;
  const payload = payloadEvento(event);

  try {
    await auth.request({
      url: `${eventsUrl}?sendUpdates=none`,
      method: "POST",
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
      data: payload,
    });
  } catch (error) {
    if (!esEstadoGoogle(error, 409)) throw error;
    const { id: _eventId, ...updatePayload } = payload;
    await auth.request({
      url: `${eventsUrl}/${encodeURIComponent(event.id)}?sendUpdates=none`,
      method: "PATCH",
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
      data: updatePayload,
    });
  }
}

export async function eliminarEventoCalendarioAsistente(
  credentials: GoogleCalendarCredentials,
  eventId: string,
): Promise<void> {
  const auth = crearAuth(credentials);
  try {
    await auth.request({
      url: `${CALENDAR_API}/calendars/primary/events/${encodeURIComponent(eventId)}?sendUpdates=none`,
      method: "DELETE",
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
    });
  } catch (error) {
    if (esEstadoGoogle(error, 404) || esEstadoGoogle(error, 410)) return;
    throw error;
  }
}

function crearAuth(credentials: GoogleCalendarCredentials): JWT {
  return new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [CALENDAR_SCOPE],
    subject: credentials.subject,
  });
}

function payloadEvento(event: EventoCalendarioAsistente) {
  const detalles = [
    event.descripcion?.trim() || null,
    event.programa ? `Programa: ${event.programa}` : null,
    event.docente ? `Docente: ${event.docente}` : null,
    event.joinUrl ? `Google Meet: ${event.joinUrl}` : null,
    "Asignación de asistencia técnica gestionada por Sala Virtual FLACSO.",
  ].filter(Boolean).join("\n\n");

  return {
    id: event.id,
    summary: event.titulo,
    description: detalles,
    ...(event.joinUrl ? { location: event.joinUrl } : {}),
    start: {
      dateTime: event.inicio.toISOString(),
      timeZone: event.timezone,
    },
    end: {
      dateTime: event.fin.toISOString(),
      timeZone: event.timezone,
    },
    extendedProperties: {
      private: {
        flacsoTipo: "ASISTENCIA_TECNICA",
        flacsoInstanciaSalaId: event.instanciaSalaId,
      },
    },
  };
}

function esEstadoGoogle(error: unknown, status: number): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  return candidate.code === status || candidate.response?.status === status;
}
