import type { JWT } from "google-auth-library";
import { GOOGLE_HTTP_TIMEOUT_MS } from "../auth";

export const CALENDAR_API_BASE_URL = "https://www.googleapis.com/calendar/v3";

export type GoogleCalendarAttendee = Readonly<{
  email: string;
  optional?: boolean;
  comment?: string;
  displayName?: string;
  responseStatus?: string;
  [key: string]: unknown;
}>;

export type GoogleCalendarDateTime = Readonly<{
  dateTime?: string;
  timeZone?: string;
  date?: string;
}>;

export type GoogleCalendarEvent = Readonly<{
  id?: string;
  summary?: string;
  description?: string;
  start?: GoogleCalendarDateTime;
  end?: GoogleCalendarDateTime;
  hangoutLink?: string;
  conferenceData?: Readonly<Record<string, unknown>>;
  attendees?: readonly GoogleCalendarAttendee[];
  [key: string]: unknown;
}>;

export type CalendarRequestOptions = Readonly<{
  conferenceDataVersion?: number;
  sendUpdates?: "all" | "none" | "externalOnly";
}>;

export function calendarEventsUrl(calendarId: string): string {
  return `${CALENDAR_API_BASE_URL}/calendars/${encodeURIComponent(calendarId)}/events`;
}

export function calendarEventUrl(calendarId: string, eventId: string): string {
  return `${calendarEventsUrl(calendarId)}/${encodeURIComponent(eventId)}`;
}

function buildCalendarUrl(baseUrl: string, options?: CalendarRequestOptions): string {
  const params = new URLSearchParams();
  if (options?.conferenceDataVersion !== undefined) {
    params.set("conferenceDataVersion", String(options.conferenceDataVersion));
  }
  if (options?.sendUpdates !== undefined) {
    params.set("sendUpdates", options.sendUpdates);
  }
  const query = params.toString();
  return query ? `${baseUrl}?${query}` : baseUrl;
}

export async function obtenerEventoCalendar(
  auth: JWT,
  calendarId: string,
  eventId: string,
  options?: CalendarRequestOptions
): Promise<GoogleCalendarEvent> {
  const url = buildCalendarUrl(calendarEventUrl(calendarId, eventId), options);
  const response = await auth.request<GoogleCalendarEvent>({
    url,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  });
  return response.data;
}

export async function obtenerEventoCalendarSiExiste(
  auth: JWT,
  calendarId: string,
  eventId: string,
  options?: CalendarRequestOptions
): Promise<GoogleCalendarEvent | null> {
  try {
    return await obtenerEventoCalendar(auth, calendarId, eventId, options);
  } catch (error) {
    if (isCalendarNotFoundError(error)) {
      return null;
    }
    throw error;
  }
}

export async function crearEventoCalendarHttp(
  auth: JWT,
  calendarId: string,
  eventData: GoogleCalendarEvent,
  options?: CalendarRequestOptions
): Promise<GoogleCalendarEvent> {
  const url = buildCalendarUrl(calendarEventsUrl(calendarId), options);
  const response = await auth.request<GoogleCalendarEvent>({
    url,
    method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: eventData,
  });
  return response.data;
}

export async function actualizarEventoCalendarHttp(
  auth: JWT,
  calendarId: string,
  eventId: string,
  patchData: Partial<GoogleCalendarEvent>,
  options?: CalendarRequestOptions
): Promise<GoogleCalendarEvent> {
  const url = buildCalendarUrl(calendarEventUrl(calendarId, eventId), options);
  const response = await auth.request<GoogleCalendarEvent>({
    url,
    method: "PATCH",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: patchData,
  });
  return response.data;
}

export async function eliminarEventoCalendarHttp(
  auth: JWT,
  calendarId: string,
  eventId: string,
  options?: CalendarRequestOptions
): Promise<void> {
  const url = buildCalendarUrl(calendarEventUrl(calendarId, eventId), options);
  await auth.request({
    url,
    method: "DELETE",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  });
}

export function isAlreadyCalendarEventError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  return (
    candidate.code === 409 ||
    candidate.response?.status === 409 ||
    JSON.stringify(candidate.response?.data ?? "").includes("ALREADY_EXISTS")
  );
}

export function isCalendarNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  return candidate.code === 404 || candidate.response?.status === 404;
}

