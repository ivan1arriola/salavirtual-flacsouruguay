import {
  crearGoogleCalendarAuthClient,
  crearEventoCalendarHttp,
  actualizarEventoCalendarHttp,
  eliminarEventoCalendarHttp,
  isAlreadyCalendarEventError,
  isCalendarNotFoundError,
  type GoogleCalendarEvent,
} from "@/src/integrations/google";
import type {
  AssistantCalendarProvider,
  EventoCalendarioAsistente,
  GoogleCalendarCredentials,
} from "../../ports";

export async function publicarEventoCalendarioAsistente(
  credentials: GoogleCalendarCredentials,
  event: EventoCalendarioAsistente
): Promise<void> {
  const auth = crearGoogleCalendarAuthClient(credentials);
  const payload = construirPayloadEvento(event);

  try {
    await crearEventoCalendarHttp(auth, "primary", payload, {
      sendUpdates: "none",
    });
  } catch (error) {
    if (!esErrorConflicto(error)) throw error;
    const { id: _id, ...updatePayload } = payload;
    await actualizarEventoCalendarHttp(auth, "primary", event.id, updatePayload, {
      sendUpdates: "none",
    });
  }
}

export async function eliminarEventoCalendarioAsistente(
  credentials: GoogleCalendarCredentials,
  eventId: string
): Promise<void> {
  const auth = crearGoogleCalendarAuthClient(credentials);
  try {
    await eliminarEventoCalendarHttp(auth, "primary", eventId, {
      sendUpdates: "none",
    });
  } catch (error) {
    if (isCalendarNotFoundError(error) || esErrorEliminado(error)) return;
    throw error;
  }
}

export function crearGoogleAssistantCalendarProvider(): AssistantCalendarProvider {
  return {
    publicarEvento: publicarEventoCalendarioAsistente,
    eliminarEvento: eliminarEventoCalendarioAsistente,
  };
}

function construirPayloadEvento(
  event: EventoCalendarioAsistente
): GoogleCalendarEvent {
  const detalles = [
    event.descripcion?.trim() || null,
    event.programa ? `Programa: ${event.programa}` : null,
    event.docente ? `Docente: ${event.docente}` : null,
    `Modalidad: ${event.modalidad === "HIBRIDA" ? "Híbrida / presencial" : "Virtual"}`,
    `Horario de la reunión/Meet: ${formatHora(event.reunionInicio, event.timezone)}–${formatHora(event.reunionFin, event.timezone)}`,
    `Horario de asistencia técnica: ${formatHora(event.inicio, event.timezone)}–${formatHora(event.fin, event.timezone)}`,
    event.joinUrl ? `Google Meet: ${event.joinUrl}` : null,
    "Asignación de asistencia técnica gestionada por Sala Virtual FLACSO.",
  ]
    .filter(Boolean)
    .join("\n\n");

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

function esErrorConflicto(error: unknown): boolean {
  if (isAlreadyCalendarEventError(error)) return true;
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  return candidate.code === 409 || candidate.response?.status === 409;
}

function esErrorEliminado(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  return (
    candidate.code === 404 ||
    candidate.code === 410 ||
    candidate.response?.status === 404 ||
    candidate.response?.status === 410
  );
}



function formatHora(value: Date, timeZone: string): string {
  return new Intl.DateTimeFormat("es-UY", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(value);
}
