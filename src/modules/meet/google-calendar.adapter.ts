import { randomUUID } from "node:crypto";
import { JWT } from "google-auth-library";
import {
  crearCalendarEvent,
  extraerMeetProvisionado,
  type CalendarEvent
} from "./google-calendar.domain";
import type { MeetProvider, MeetProvisionResult } from "./provider";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";

export type GoogleCalendarCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export async function configurarGoogleMeetExistente(
  credentials: GoogleCalendarCredentials,
  codigoReunion: string,
  settings: Readonly<{ requiereAsistencia?: boolean; requiereGrabacion?: boolean }>
): Promise<void> {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [MEET_SETTINGS_SCOPE],
    subject: credentials.subject
  });
  await configurarEspacioMeet(auth, codigoReunion, settings);
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
    scopes: [MEET_SETTINGS_SCOPE],
    subject: credentials.subject
  });

  return {
    async provisionarEvento(request) {
      const eventsUrl = calendarEventsUrl(request.calendarId);
      const response = await auth.request<CalendarEvent>({
        url: `${eventsUrl}?conferenceDataVersion=1&sendUpdates=none`,
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
    }
  };
}

async function finalizarProvision(
  auth: JWT,
  result: MeetProvisionResult,
  request: Readonly<{ requiereAsistencia?: boolean; requiereGrabacion?: boolean }>
): Promise<MeetProvisionResult> {
  try {
    await configurarEspacioMeet(auth, result.codigoReunion, request);
    return result;
  } catch (error) {
    return {
      ...result,
      warning: error instanceof Error
        ? `Enlace creado, pero no se configuraron los artefactos automáticos: ${error.message}`
        : "Enlace creado, pero no se configuraron los artefactos automáticos."
    };
  }
}

async function configurarEspacioMeet(
  auth: JWT,
  codigoReunion: string,
  request: Readonly<{ requiereAsistencia?: boolean; requiereGrabacion?: boolean }>
): Promise<void> {
  if (!request.requiereAsistencia && !request.requiereGrabacion) return;
  const current = await auth.request<{ name?: string }>({
    url: `${MEET_API}/spaces/${encodeURIComponent(codigoReunion)}`,
    method: "GET"
  });
  if (!current.data.name) throw new Error("Google Meet no devolvió el ID del espacio.");
  const config = {
    ...(request.requiereAsistencia
      ? { attendanceReportGenerationType: "GENERATE_REPORT" }
      : {}),
    ...(request.requiereGrabacion
      ? { artifactConfig: { recordingConfig: { autoRecordingGeneration: "ON" } } }
      : {})
  };
  const updateMask = [
    ...(request.requiereAsistencia ? ["config.attendance_report_generation_type"] : []),
    ...(request.requiereGrabacion
      ? ["config.artifact_config.recording_config.auto_recording_generation"]
      : [])
  ].join(",");
  await auth.request({
    url: `${MEET_API}/${current.data.name}?updateMask=${encodeURIComponent(updateMask)}`,
    method: "PATCH",
    data: { name: current.data.name, config }
  });
}

function calendarEventsUrl(calendarId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
