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
const MEET_CREATED_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";
const MEET_BETA_API = "https://meet.googleapis.com/v2beta";
const GOOGLE_HTTP_TIMEOUT_MS = 60_000;

export type GoogleCalendarCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

type CalendarAttendee = Readonly<{
  email: string;
  optional?: boolean;
  comment?: string;
  displayName?: string;
  responseStatus?: string;
}>;

type CalendarEventWithAttendees = CalendarEvent & Readonly<{
  attendees?: readonly CalendarAttendee[];
}>;

type MeetSpaceMember = Readonly<{
  name?: string;
  email?: string;
  role?: string;
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
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
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
    scopes: [MEET_SETTINGS_SCOPE, MEET_READ_SCOPE, MEET_CREATED_SCOPE],
    subject: credentials.subject
  });
  const spaceName = await configurarEspacioMeet(auth, codigoReunion, settings);
  await configurarCohostsMeet(auth, spaceName, settings.cohostEmails ?? []);
}

export async function sincronizarCohostsGoogleExistente(
  credentials: GoogleCalendarCredentials,
  input: Readonly<{
    calendarId: string;
    externalEventId: string;
    codigoReunion?: string | null;
    cohostsAnteriores: readonly string[];
    cohostsDeseados: readonly string[];
  }>
): Promise<Readonly<Record<string, unknown>>> {
  const calendarAuth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [CALENDAR_SCOPE],
    subject: credentials.subject
  });
  const meetAuth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [MEET_SETTINGS_SCOPE, MEET_READ_SCOPE, MEET_CREATED_SCOPE],
    subject: credentials.subject
  });
  const eventUrl = `${calendarEventsUrl(input.calendarId)}/${encodeURIComponent(input.externalEventId)}`;
  const current = await calendarAuth.request<CalendarEventWithAttendees>({
    url: eventUrl,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS
  });
  const desired = normalizarEmails(input.cohostsDeseados);
  const previous = normalizarEmails(input.cohostsAnteriores);
  const attendees = reconciliarAttendees(current.data.attendees ?? [], previous, desired);
  const updated = mismosAttendees(current.data.attendees ?? [], attendees)
    ? current.data
    : (await calendarAuth.request<CalendarEventWithAttendees>({
        url: `${eventUrl}?sendUpdates=all`,
        method: "PATCH",
        timeout: GOOGLE_HTTP_TIMEOUT_MS,
        data: { attendees }
      })).data;

  if (input.codigoReunion) {
    const spaceName = await configurarEspacioMeet(meetAuth, input.codigoReunion, { cohostEmails: desired });
    await reconciliarCohostsMeet(meetAuth, spaceName, previous, desired);
  }

  return JSON.parse(JSON.stringify(updated)) as Readonly<Record<string, unknown>>;
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
    scopes: [MEET_SETTINGS_SCOPE, MEET_READ_SCOPE, MEET_CREATED_SCOPE],
    subject: credentials.subject
  });

  return {
    async crearEventoCalendar(request) {
      const eventsUrl = calendarEventsUrl(request.calendarId);
      let response: { data: CalendarEvent };
      try {
        response = await auth.request<CalendarEvent>({
          url: `${eventsUrl}?conferenceDataVersion=1&sendUpdates=${request.cohostEmails?.length ? "all" : "none"}`,
          method: "POST",
          timeout: GOOGLE_HTTP_TIMEOUT_MS,
          data: crearCalendarEvent(request, request.calendarEventId)
        });
      } catch (error) {
        if (!isAlreadyCalendarEvent(error)) throw error;
        response = await auth.request<CalendarEvent>({
          url: `${eventsUrl}/${encodeURIComponent(request.calendarEventId)}`,
          method: "GET",
          timeout: GOOGLE_HTTP_TIMEOUT_MS
        });
      }
      const eventId = response.data.id;
      if (!eventId) throw new Error("Google Calendar no devolvio el ID del evento.");

      return { externalEventId: eventId, payload: response.data };
    },
    async obtenerEvento(calendarId, externalEventId) {
      const current = await auth.request<CalendarEvent>({
        url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(externalEventId)}`,
        method: "GET",
        timeout: GOOGLE_HTTP_TIMEOUT_MS
      });
      return extraerMeetProvisionado(current.data);
    },
    async configurarEventoMeet(request, evento) {
      await finalizarProvision(meetAuth, evento, request);
    },
    async cancelarEvento(calendarId, externalEventId) {
      await auth.request({
        url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(externalEventId)}?sendUpdates=none`,
        method: "DELETE",
        timeout: GOOGLE_HTTP_TIMEOUT_MS
      });
    },
    async actualizarEvento(calendarId, externalEventId, request) {
      await auth.request({
        url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(externalEventId)}?sendUpdates=none`,
        method: "PATCH",
        timeout: GOOGLE_HTTP_TIMEOUT_MS,
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
  const spaceName = await configurarEspacioMeet(auth, result.codigoReunion, request);
  await configurarCohostsMeet(auth, spaceName, request.cohostEmails ?? []);
  return result;
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
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS
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
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
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
        timeout: GOOGLE_HTTP_TIMEOUT_MS,
        data: { email, role: "COHOST" }
      });
    } catch (error) {
      if (isAlreadyCohostError(error)) return;
      throw error;
    }
  }));
}

async function reconciliarCohostsMeet(
  auth: JWT,
  spaceName: string,
  previousEmails: readonly string[],
  desiredEmails: readonly string[]
): Promise<void> {
  const previous = new Set(normalizarEmails(previousEmails));
  const desired = new Set(normalizarEmails(desiredEmails));
  const members = await listarMiembrosMeet(auth, spaceName);
  const cohosts = members.filter(({ role }) => role === "COHOST");

  await Promise.all(cohosts.flatMap((member) => {
    const email = member.email?.trim().toLowerCase();
    if (!member.name || !email || !previous.has(email) || desired.has(email)) return [];
    return [auth.request({
      url: `${MEET_BETA_API}/${member.name}`,
      method: "DELETE",
      timeout: GOOGLE_HTTP_TIMEOUT_MS
    }).catch((error) => {
      if (isNotFoundError(error)) return;
      throw error;
    })];
  }));

  const existing = new Set(cohosts.flatMap(({ email }) => email ? [email.trim().toLowerCase()] : []));
  await configurarCohostsMeet(auth, spaceName, [...desired].filter((email) => !existing.has(email)));
}

async function listarMiembrosMeet(auth: JWT, spaceName: string): Promise<readonly MeetSpaceMember[]> {
  const members: MeetSpaceMember[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);
    const response = await auth.request<{ members?: readonly MeetSpaceMember[]; nextPageToken?: string }>({
      url: `${MEET_BETA_API}/${spaceName}/members?${query.toString()}`,
      method: "GET",
      timeout: GOOGLE_HTTP_TIMEOUT_MS
    });
    members.push(...(response.data.members ?? []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return members;
}

function reconciliarAttendees(
  current: readonly CalendarAttendee[],
  previousEmails: readonly string[],
  desiredEmails: readonly string[]
): readonly CalendarAttendee[] {
  const previous = new Set(normalizarEmails(previousEmails));
  const result = new Map<string, CalendarAttendee>();
  for (const attendee of current) {
    const email = attendee.email.trim().toLowerCase();
    if (!previous.has(email)) result.set(email, { ...attendee, email });
  }
  for (const email of normalizarEmails(desiredEmails)) result.set(email, { email });
  return [...result.values()];
}

function mismosAttendees(left: readonly CalendarAttendee[], right: readonly CalendarAttendee[]): boolean {
  const emails = (values: readonly CalendarAttendee[]) => values
    .map(({ email }) => email.trim().toLowerCase())
    .sort()
    .join(",");
  return emails(left) === emails(right);
}

function normalizarEmails(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

function isAlreadyCohostError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown; data?: unknown } };
  if (candidate.code === 409 || candidate.response?.status === 409) return true;
  return JSON.stringify(candidate.response?.data ?? "").includes("ALREADY_EXISTS");
}

function isNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  return candidate.code === 404 || candidate.response?.status === 404;
}

function isAlreadyCalendarEvent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown; data?: unknown } };
  return candidate.code === 409 || candidate.response?.status === 409 || JSON.stringify(candidate.response?.data ?? "").includes("ALREADY_EXISTS");
}

function calendarEventsUrl(calendarId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
}
