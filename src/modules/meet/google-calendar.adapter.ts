import { randomUUID } from "node:crypto";
import { JWT } from "google-auth-library";
import {
  crearCalendarEvent,
  extraerMeetProvisionado,
  type CalendarEvent
} from "./google-calendar.domain";
import type { MeetProvider } from "./provider";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";

export type GoogleCalendarCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export function crearGoogleCalendarProvider(
  credentials: GoogleCalendarCredentials
): MeetProvider {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [CALENDAR_SCOPE],
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
      if (immediate) return immediate;

      for (const delay of [250, 500, 1000, 2000]) {
        await sleep(delay);
        const current = await auth.request<CalendarEvent>({
          url: `${eventsUrl}/${encodeURIComponent(eventId)}`,
          method: "GET"
        });
        const provisioned = extraerMeetProvisionado(current.data);
        if (provisioned) return provisioned;
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

function calendarEventsUrl(calendarId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
