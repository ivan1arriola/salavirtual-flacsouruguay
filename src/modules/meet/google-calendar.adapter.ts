import { randomUUID } from "node:crypto";
import { JWT } from "google-auth-library";
import {
  crearCalendarEvent,
  extraerMeetProvisionado,
  type CalendarEvent
} from "./google-calendar.domain";
import type { MeetProvider, MeetProvisionRequest, MeetProvisionResult } from "./provider";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";
const MEET_READ_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";
const MEET_BETA_API = "https://meet.googleapis.com/v2beta";

export type GoogleCalendarCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export async function compartirConferenciaGoogleCalendar(
  credentials: GoogleCalendarCredentials,
  calendarId: string,
  externalEventId: string,
  conferenceData: Readonly<Record<string, unknown>>
): Promise<MeetProvisionResult> {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [CALENDAR_SCOPE],
    subject: credentials.subject
  });
  const response = await auth.request<CalendarEvent>({
    url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(externalEventId)}?conferenceDataVersion=1&sendUpdates=none`,
    method: "PATCH",
    data: { conferenceData }
  });
  const result = extraerMeetProvisionado(response.data);
  if (!result) {
    throw new Error("Google Calendar no confirmó el enlace Meet compartido.");
  }
  return result;
}

export async function configurarGoogleMeetExistente(
  credentials: GoogleCalendarCredentials,
  codigoReunion: string,
  settings: Readonly<{
    requiereAsistenciaTecnica?: boolean;
    cohostEmails?: readonly string[];
  }>
): Promise<void> {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [MEET_SETTINGS_SCOPE, MEET_READ_SCOPE],
    subject: credentials.subject
  });
  const spaceName = await configurarEspacioMeet(auth, codigoReunion, settings);
  await configurarCohostsMeet(auth, spaceName, settings.cohostEmails ?? []);
}

export function crearGoogleCalendarProvider(
  credentials: GoogleCalendarCredentials
): MeetProvider {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [CALENDAR_SCOPE],
    subject: credentials.subject
  });
  const meetAuth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [MEET_SETTINGS_SCOPE, MEET_READ_SCOPE],
    subject: credentials.subject
  });

  return {
    async provisionarEvento(request) {
      const eventsUrl = calendarEventsUrl(request.calendarId);
      const response = await auth.request<CalendarEvent>({
        url: `${eventsUrl}?conferenceDataVersion=1&sendUpdates=${request.cohostEmails?.length ? "all" : "none"}`,
        method: "POST",
        data: crearCalendarEvent(request, randomUUID())
      });
      const eventId = response.data.id;
      if (!eventId) throw new Error("Google Calendar no devolvio el ID del evento.");

      const immediate = extraerMeetProvisionado(response.data);
      if (immediate) {
        return finalizarProvision(meetAuth, immediate, request);
      }

      for (const delay of [250, 500, 1000, 2000]) {
        await sleep(delay);
        const current = await auth.request<CalendarEvent>({
          url: `${eventsUrl}/${encodeURIComponent(eventId)}`,
          method: "GET"
        });
        const provisioned = extraerMeetProvisionado(current.data);
        if (provisioned) {
          return finalizarProvision(meetAuth, provisioned, request);
        }
      }
      throw new Error("Google Calendar no termino de generar el enlace Meet.");
    },
    async cancelarEvento(calendarId, externalEventId) {
      await auth.request({
        url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(externalEventId)}?sendUpdates=none`,
        method: "DELETE"
      });
    },
    async actualizarEvento(calendarId, externalEventId, request) {
      await auth.request({
        url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(externalEventId)}?sendUpdates=none`,
        method: "PATCH",
        data: {
          summary: request.titulo,
          description: request.descripcion,
          start: { dateTime: request.inicio.toISOString(), timeZone: request.timezone },
          end: { dateTime: request.fin.toISOString(), timeZone: request.timezone }
        }
      });
    }
  };
}

async function finalizarProvision(
  auth: JWT,
  result: MeetProvisionResult,
  request: MeetProvisionRequest
): Promise<MeetProvisionResult> {
  try {
    const spaceName = await configurarEspacioMeet(auth, result.codigoReunion, request);
    await configurarCohostsMeet(auth, spaceName, request.cohostEmails ?? []);
    return result;
  } catch (error) {
    return {
      ...result,
      warning: error instanceof Error
        ? `Enlace creado, pero la configuración de Meet quedó incompleta: ${error.message}`
        : "Enlace creado, pero la configuración de Meet quedó incompleta."
    };
  }
}

async function configurarEspacioMeet(
  auth: JWT,
  codigoReunion: string,
  request: Readonly<{ requiereAsistenciaTecnica?: boolean; cohostEmails?: readonly string[] }>
): Promise<string> {
  const configurarAsistencia = request.requiereAsistenciaTecnica !== undefined;
  const configurarModeracion = Boolean(request.cohostEmails?.length);
  const current = await auth.request<{ name?: string }>({
    url: `${MEET_API}/spaces/${encodeURIComponent(codigoReunion)}`,
    method: "GET"
  });
  if (!current.data.name) throw new Error("Google Meet no devolvió el ID del espacio.");
  const config = {
    ...(configurarAsistencia
      ? { attendanceReportGenerationType: request.requiereAsistenciaTecnica ? "GENERATE_REPORT" : "DO_NOT_GENERATE" }
      : {}),
    ...(configurarModeracion ? { moderation: "ON" } : {})
  };
  const updateMask = [
    ...(configurarAsistencia ? ["config.attendance_report_generation_type"] : []),
    ...(configurarModeracion ? ["config.moderation"] : [])
  ].join(",");
  if (updateMask) {
    await auth.request({
      url: `${MEET_API}/${current.data.name}?updateMask=${encodeURIComponent(updateMask)}`,
      method: "PATCH",
      data: { name: current.data.name, config }
    });
  }
  return current.data.name;
}

async function configurarCohostsMeet(
  auth: JWT,
  spaceName: string,
  emails: readonly string[]
): Promise<void> {
  await Promise.all(emails.map(async (email) => {
    try {
      await auth.request({
        url: `${MEET_BETA_API}/${spaceName}/members`,
        method: "POST",
        data: { email, role: "COHOST" }
      });
    } catch (error) {
      if (isAlreadyCohostError(error)) return;
      throw error;
    }
  }));
}

function isAlreadyCohostError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown; data?: unknown } };
  if (candidate.code === 409 || candidate.response?.status === 409) return true;
  return JSON.stringify(candidate.response?.data ?? "").includes("ALREADY_EXISTS");
}

function calendarEventsUrl(calendarId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
