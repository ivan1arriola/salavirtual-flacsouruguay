import { JWT } from "google-auth-library";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { cargarCredencialesLegacyGoogleWorkspace } from "../configuracion/google-workspace.service";
import { registrarVerificacionCohosts } from "./cohost-verification.domain";
import {
  crearCalendarEvent,
  crearConferenceDataMeet,
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

type MeetSpace = Readonly<{
  name?: string;
  meetingCode?: string;
  meetingUri?: string;
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
  try {
    await configurarGoogleMeetConCredencial(credentials, codigoReunion, settings);
  } catch (error) {
    if (!esErrorPermisoMember(error)) throw error;
    let lastError: unknown = error;
    for (const legacy of await credencialesLegacy(credentials.subject)) {
      try {
        await configurarGoogleMeetConCredencial(legacy, codigoReunion, settings);
        return;
      } catch (legacyError) {
        lastError = legacyError;
        if (!esErrorPermisoMember(legacyError)) throw legacyError;
      }
    }
    throw lastError;
  }
}

async function configurarGoogleMeetConCredencial(
  credentials: GoogleCalendarCredentials,
  codigoReunion: string,
  settings: Readonly<{
    requiereAsistenciaTecnica?: boolean;
    cohostEmails?: readonly string[];
  }>
): Promise<void> {
  const auth = crearMeetAuth(credentials);
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
  try {
    return await sincronizarCohostsGoogleConCredencial(credentials, input);
  } catch (error) {
    if (!esErrorPermisoMember(error)) throw error;
    let lastError: unknown = error;
    for (const legacy of await credencialesLegacy(credentials.subject)) {
      try {
        return await sincronizarCohostsGoogleConCredencial(legacy, input);
      } catch (legacyError) {
        lastError = legacyError;
        if (!esErrorPermisoMember(legacyError)) throw legacyError;
      }
    }
    throw lastError;
  }
}

async function sincronizarCohostsGoogleConCredencial(
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
  const meetAuth = crearMeetAuth(credentials);
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

  const provisioned = extraerMeetProvisionado(updated);
  if (!provisioned) throw new Error("Google Calendar no confirmó el espacio Meet de este evento.");
  const spaceName = await configurarEspacioMeet(meetAuth, provisioned.codigoReunion, { cohostEmails: desired });
  await reconciliarCohostsMeet(meetAuth, spaceName, previous, desired);
  return registrarVerificacionCohosts(updated, provisioned.codigoReunion, credentials.subject, desired, new Date().toISOString());
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
  const meetAuth = crearMeetAuth(credentials);
  let provisioningAttempt = false;

  return {
    async crearEventoCalendar(request) {
      provisioningAttempt = true;
      const eventsUrl = calendarEventsUrl(request.calendarId);
      const eventUrl = `${eventsUrl}/${encodeURIComponent(request.calendarEventId)}`;
      const existing = await obtenerEventoCalendarSiExiste(auth, eventUrl);
      if (existing && extraerMeetProvisionado(existing)) {
        return { externalEventId: existing.id!, payload: existing };
      }

      let conferenceData = request.conferenceData;
      let createdSpace: Required<Pick<MeetSpace, "name" | "meetingCode" | "meetingUri">> | null = null;
      if (!conferenceData) {
        createdSpace = await crearEspacioMeetAplicacion(meetAuth, request);
        conferenceData = crearConferenceDataMeet(createdSpace.meetingCode, createdSpace.meetingUri);
      }

      const requestWithConference: MeetProvisionRequest = { ...request, conferenceData };
      const sendUpdates = request.cohostEmails?.length ? "all" : "none";
      let response: { data: CalendarEvent };

      if (existing) {
        response = await auth.request<CalendarEvent>({
          url: `${eventUrl}?conferenceDataVersion=1&sendUpdates=${sendUpdates}`,
          method: "PATCH",
          timeout: GOOGLE_HTTP_TIMEOUT_MS,
          data: { conferenceData }
        });
      } else {
        try {
          response = await auth.request<CalendarEvent>({
            url: `${eventsUrl}?conferenceDataVersion=1&sendUpdates=${sendUpdates}`,
            method: "POST",
            timeout: GOOGLE_HTTP_TIMEOUT_MS,
            data: crearCalendarEvent(requestWithConference)
          });
        } catch (error) {
          if (!isAlreadyCalendarEvent(error)) throw error;
          response = await auth.request<CalendarEvent>({
            url: `${eventUrl}?conferenceDataVersion=1`,
            method: "GET",
            timeout: GOOGLE_HTTP_TIMEOUT_MS
          });
        }
      }

      const eventId = response.data.id;
      if (!eventId) throw new Error("Google Calendar no devolvió el ID del evento.");

      const provisioned = extraerMeetProvisionado(response.data);
      if (!provisioned) {
        throw new Error("Google Calendar no confirmó el espacio Meet creado por Sala Virtual.");
      }
      if (createdSpace && (
        provisioned.codigoReunion !== createdSpace.meetingCode ||
        provisioned.joinUrl !== createdSpace.meetingUri
      )) {
        throw new Error("Google Calendar vinculó una conferencia distinta al espacio Meet creado por Sala Virtual.");
      }

      return { externalEventId: eventId, payload: response.data };
    },
    async obtenerEvento(calendarId, externalEventId) {
      const current = await auth.request<CalendarEvent>({
        url: `${calendarEventsUrl(calendarId)}/${encodeURIComponent(externalEventId)}?conferenceDataVersion=1`,
        method: "GET",
        timeout: GOOGLE_HTTP_TIMEOUT_MS
      });
      return extraerMeetProvisionado(current.data);
    },
    async configurarEventoMeet(request, evento) {
      try {
        await finalizarProvision(meetAuth, evento, request);
      } catch (error) {
        if (provisioningAttempt || !esErrorPermisoMember(error)) throw error;
        let lastError: unknown = error;
        for (const legacy of await credencialesLegacy(credentials.subject)) {
          try {
            await finalizarProvision(crearMeetAuth(legacy), evento, request);
            return;
          } catch (legacyError) {
            lastError = legacyError;
            if (!esErrorPermisoMember(legacyError)) throw legacyError;
          }
        }
        throw lastError;
      }
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

async function credencialesLegacy(
  subject: string
): Promise<readonly GoogleCalendarCredentials[]> {
  const rows = await cargarCredencialesLegacyGoogleWorkspace(
    db,
    descifrarConfiguracion
  );

  return rows.map((credential) => ({
    serviceAccountEmail: credential.serviceAccountEmail,
    privateKey: credential.privateKey,
    subject,
  }));
}

function crearMeetAuth(credentials: GoogleCalendarCredentials): JWT {
  return new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [MEET_SETTINGS_SCOPE, MEET_READ_SCOPE, MEET_CREATED_SCOPE],
    subject: credentials.subject
  });
}

async function crearEspacioMeetAplicacion(
  auth: JWT,
  request: Pick<MeetProvisionRequest, "cohostEmails" | "requiereAsistenciaTecnica">
): Promise<Required<Pick<MeetSpace, "name" | "meetingCode" | "meetingUri">>> {
  const cohosts = normalizarEmails(request.cohostEmails ?? []);
  const created = await auth.request<MeetSpace>({
    url: `${MEET_API}/spaces`,
    method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: {
      config: {
        moderation: cohosts.length > 0 ? "ON" : "OFF",
        accessType: "TRUSTED",
        ...(request.requiereAsistenciaTecnica !== undefined
          ? {
              attendanceReportGenerationType: request.requiereAsistenciaTecnica
                ? "GENERATE_REPORT"
                : "DO_NOT_GENERATE"
            }
          : {})
      }
    }
  });

  const name = created.data.name;
  const meetingCode = created.data.meetingCode;
  const meetingUri = created.data.meetingUri;
  if (!name || !meetingCode || !meetingUri) {
    throw new Error("Google Meet no devolvió name, meetingCode y meetingUri para el nuevo espacio.");
  }

  await configurarCohostsMeet(auth, name, cohosts);
  return { name, meetingCode, meetingUri };
}

async function obtenerEventoCalendarSiExiste(
  auth: JWT,
  eventUrl: string
): Promise<CalendarEvent | null> {
  try {
    const response = await auth.request<CalendarEvent>({
      url: `${eventUrl}?conferenceDataVersion=1`,
      method: "GET",
      timeout: GOOGLE_HTTP_TIMEOUT_MS
    });
    return response.data;
  } catch (error) {
    if (isNotFoundError(error)) return null;
    throw error;
  }
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
  if (configurarModeracion) {
    const verified = await auth.request<{ config?: { moderation?: string } }>({
      url: `${MEET_API}/${current.data.name}`, method: "GET", timeout: GOOGLE_HTTP_TIMEOUT_MS,
    });
    if (verified.data.config?.moderation !== "ON") {
      throw new Error("Google Meet no confirmó la administración de anfitriones.");
    }
  }
  return current.data.name;
}

async function configurarCohostsMeet(
  auth: JWT,
  spaceName: string,
  emails: readonly string[]
): Promise<void> {
  const desired = emailsCohost(auth, emails);
  for (const email of desired) {
    try {
      await crearMiembroCohost(auth, spaceName, email);
    } catch (error) {
      if (!isAlreadyCohostError(error)) throw error;
      const members = await listarMiembrosMeet(auth, spaceName);
      const member = members.find((item) => item.email?.trim().toLowerCase() === email);
      if (!member?.name) throw new Error(`Google Meet no permitió verificar el miembro ${email}.`);
      if (member.role !== "COHOST") {
        await auth.request({
          url: `${MEET_BETA_API}/${member.name}`,
          method: "DELETE",
          timeout: GOOGLE_HTTP_TIMEOUT_MS,
        }).catch((caught) => { if (!isNotFoundError(caught)) throw caught; });
        await crearMiembroCohost(auth, spaceName, email);
      }
    }
  }
  await verificarCohostsMeet(auth, spaceName, desired);
}

async function verificarCohostsMeet(
  auth: JWT,
  spaceName: string,
  desiredEmails: readonly string[]
): Promise<void> {
  const desired = emailsCohost(auth, desiredEmails);
  if (desired.length === 0) return;
  const members = await listarMiembrosMeet(auth, spaceName);
  const actual = new Set(
    members
      .filter(({ role }) => role === "COHOST")
      .flatMap(({ email }) => email ? [email.trim().toLowerCase()] : [])
  );
  const missing = desired.filter((email) => !actual.has(email));
  if (missing.length > 0) {
    throw new Error(`Google Meet no confirmó los cohosts: ${missing.join(", ")}`);
  }
}

async function reconciliarCohostsMeet(
  auth: JWT,
  spaceName: string,
  previousEmails: readonly string[],
  desiredEmails: readonly string[]
): Promise<void> {
  const previous = new Set(emailsCohost(auth, previousEmails));
  const desired = new Set(emailsCohost(auth, desiredEmails));
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
  await verificarCohostsMeet(auth, spaceName, [...desired]);
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

function emailsCohost(auth: JWT, emails: readonly string[]): readonly string[] {
  return normalizarEmails(emails).filter((email) => email !== auth.subject?.trim().toLowerCase());
}

async function crearMiembroCohost(auth: JWT, spaceName: string, email: string): Promise<void> {
  await auth.request({
    url: `${MEET_BETA_API}/${spaceName}/members`, method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS, data: { email, role: "COHOST" },
  });
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

function esErrorPermisoMember(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  const status = candidate.response?.status ?? candidate.code;
  const text = [
    typeof candidate.message === "string" ? candidate.message : "",
    JSON.stringify(candidate.response?.data ?? ""),
  ].join(" ").toLowerCase();
  return (status === 403 || text.includes("permission denied")) && text.includes("resource member");
}

function calendarEventsUrl(calendarId: string): string {
  return `${CALENDAR_API}/calendars/${encodeURIComponent(calendarId)}/events`;
}
