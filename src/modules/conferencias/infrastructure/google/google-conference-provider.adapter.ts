import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { claveOperacionGoogle, ejecutarGooglePostUnaVez } from "@/src/modules/operaciones/google-operaciones-externas.service";
import {
  crearGoogleCalendarAuthClient,
  crearGoogleMeetAuthClient,
} from "@/src/integrations/google/auth";
import {
  actualizarEventoCalendarHttp,
  crearEventoCalendarHttp,
  eliminarEventoCalendarHttp,
  isAlreadyCalendarEventError,
  obtenerEventoCalendar,
  obtenerEventoCalendarSiExiste,
  type GoogleCalendarAttendee,
} from "@/src/integrations/google/calendar";
import {
  actualizarEspacioMeetHttp,
  actualizarRolMiembroMeetHttp,
  crearEspacioMeetHttp,
  crearMiembroMeetHttp,
  eliminarMiembroMeetHttp,
  isAlreadyCohostError,
  isMeetNotFoundError,
  isMemberPermissionError,
  listarMiembrosMeetHttp,
  obtenerEspacioMeet,
  type GoogleMeetSpaceMember,
} from "@/src/integrations/google/meet";
import { cargarCredencialesLegacyGoogleWorkspace } from "@/src/modules/configuracion/google-workspace.service";
import {
  crearCalendarEvent,
  crearConferenceDataMeet,
  extraerMeetProvisionado,
  registrarVerificacionCohosts,
  type CalendarEvent,
  type ConferenceProvisionRequest,
  type ConferenceProvisionResult,
} from "../../domain";
import type { ConferenceProvider } from "../../ports/conference-provider.port";

export type GoogleCalendarCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

type CalendarAttendee = GoogleCalendarAttendee;
type CalendarEventWithAttendees = CalendarEvent & Readonly<{
  attendees?: readonly CalendarAttendee[];
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
): Promise<ConferenceProvisionResult> {
  const auth = crearGoogleCalendarAuthClient(credentials);
  const updated = await actualizarEventoCalendarHttp(
    auth,
    calendarId,
    externalEventId,
    { conferenceData },
    { conferenceDataVersion: 1, sendUpdates: "none" }
  );
  const result = extraerMeetProvisionado(updated as CalendarEvent);
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
    if (!isMemberPermissionError(error)) throw error;
    for (const legacy of await credencialesLegacy(credentials.subject)) {
      try {
        await configurarGoogleMeetConCredencial(legacy, codigoReunion, settings);
        return;
      } catch (legacyError) {
        if (!isMemberPermissionError(legacyError)) throw legacyError;
      }
    }
    // Never report success if neither Principal nor Legacy could assign members.
    // The caller must retain the pending/error state until Google confirms COHOST.
    throw error;
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
  const auth = crearGoogleMeetAuthClient(credentials);
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
    if (!isMemberPermissionError(error)) throw error;
    for (const legacy of await credencialesLegacy(credentials.subject)) {
      try {
        return await sincronizarCohostsGoogleConCredencial(legacy, input);
      } catch (legacyError) {
        if (!isMemberPermissionError(legacyError)) throw legacyError;
      }
    }
    // Calendar invitations are not proof of COHOST. Do not write a verified
    // payload when all available credentials were denied by spaces.members.
    throw error;
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
  const calendarAuth = crearGoogleCalendarAuthClient(credentials);
  const meetAuth = crearGoogleMeetAuthClient(credentials);

  const current = (await obtenerEventoCalendar(
    calendarAuth,
    input.calendarId,
    input.externalEventId
  )) as CalendarEventWithAttendees;

  const desired = normalizarEmails(input.cohostsDeseados);
  const previous = normalizarEmails(input.cohostsAnteriores);
  const attendees = reconciliarAttendees(current.attendees ?? [], previous, desired);

  const updated = mismosAttendees(current.attendees ?? [], attendees)
    ? current
    : ((await actualizarEventoCalendarHttp(
        calendarAuth,
        input.calendarId,
        input.externalEventId,
        { attendees },
        { sendUpdates: "all" }
      )) as CalendarEventWithAttendees);

  const provisioned = extraerMeetProvisionado(updated);
  if (!provisioned) throw new Error("Google Calendar no confirmó el espacio Meet de este evento.");
  const spaceName = await configurarEspacioMeet(meetAuth, provisioned.codigoReunion, { cohostEmails: desired });
  await reconciliarCohostsMeet(meetAuth, spaceName, previous, desired);
  return registrarVerificacionCohosts(updated, provisioned.codigoReunion, credentials.subject, desired, new Date().toISOString());
}

export function crearGoogleConferenceProvider(
  credentials: GoogleCalendarCredentials
): ConferenceProvider {
  const auth = crearGoogleCalendarAuthClient(credentials);
  const meetAuth = crearGoogleMeetAuthClient(credentials);
  let provisioningAttempt = false;

  return {
    async crearEventoCalendar(request) {
      provisioningAttempt = true;
      const existing = (await obtenerEventoCalendarSiExiste(
        auth,
        request.calendarId,
        request.calendarEventId,
        { conferenceDataVersion: 1 }
      )) as CalendarEvent | null;

      if (existing && extraerMeetProvisionado(existing)) {
        return { externalEventId: existing.id!, payload: existing };
      }

      let conferenceData = request.conferenceData;
      let createdSpace: Required<Pick<MeetSpace, "name" | "meetingCode" | "meetingUri">> | null = null;
      if (!conferenceData) {
        const key = claveOperacionGoogle(
          "MEET_CREAR_ESPACIO", credentials.subject, request.calendarId, request.calendarEventId
        );
        createdSpace = await ejecutarGooglePostUnaVez(
          db,
          { clave: key, proveedor: "MEET", tipo: "MEET_CREAR_ESPACIO", cuenta: credentials.subject, referencia: request.calendarEventId },
          () => crearEspacioMeetAplicacion(meetAuth, request),
          (space) => ({
            name: space.name,
            meetingCode: space.meetingCode,
            meetingUri: space.meetingUri
          }),
          (space) => {
            if (!space.name || !space.meetingCode || !space.meetingUri) {
              throw new Error("El registro remoto de Meet está incompleto.");
            }
            return { name: space.name, meetingCode: space.meetingCode, meetingUri: space.meetingUri };
          }
        );
        conferenceData = crearConferenceDataMeet(createdSpace.meetingCode, createdSpace.meetingUri);
      }

      const requestWithConference: ConferenceProvisionRequest = { ...request, conferenceData };
      const sendUpdates = request.cohostEmails?.length ? "all" : "none";
      let responseData: CalendarEvent;

      if (existing) {
        responseData = (await actualizarEventoCalendarHttp(
          auth,
          request.calendarId,
          request.calendarEventId,
          { conferenceData },
          { conferenceDataVersion: 1, sendUpdates }
        )) as CalendarEvent;
      } else {
        try {
          responseData = (await crearEventoCalendarHttp(
            auth,
            request.calendarId,
            crearCalendarEvent(requestWithConference),
            { conferenceDataVersion: 1, sendUpdates }
          )) as CalendarEvent;
        } catch (error) {
          // A timeout/network failure may happen AFTER Google created the event.
          // Recover using our deterministic Calendar event ID before retrying a POST.
          // A 404 does not prove the original POST failed; fail closed and let the
          // next worker attempt reconcile instead of creating another event here.
          const conflict = isAlreadyCalendarEventError(error);
          let recovered: CalendarEvent | null = null;
          try {
            recovered = (await obtenerEventoCalendarSiExiste(
              auth,
              request.calendarId,
              request.calendarEventId,
              { conferenceDataVersion: 1 }
            )) as CalendarEvent | null;
          } catch {
            // Preserve the original failure; GET can also fail transiently.
          }
          if (!recovered) throw error;
          if (recovered.id !== request.calendarEventId) {
            throw new Error("Google Calendar devolvió un evento con ID inesperado.");
          }
          if (!extraerMeetProvisionado(recovered) && !conflict) {
            throw error;
          }
          responseData = recovered;
        }
      }

      const eventId = responseData.id;
      if (!eventId) throw new Error("Google Calendar no devolvió el ID del evento.");

      const provisioned = extraerMeetProvisionado(responseData);
      if (!provisioned) {
        throw new Error("Google Calendar no confirmó el espacio Meet creado por Sala Virtual.");
      }
      if (
        createdSpace &&
        (provisioned.codigoReunion !== createdSpace.meetingCode ||
          provisioned.joinUrl !== createdSpace.meetingUri)
      ) {
        throw new Error("Google Calendar vinculó una conferencia distinta al espacio Meet creado por Sala Virtual.");
      }

      return { externalEventId: eventId, payload: responseData };
    },
    async obtenerEvento(calendarId, externalEventId) {
      const current = (await obtenerEventoCalendar(
        auth,
        calendarId,
        externalEventId,
        { conferenceDataVersion: 1 }
      )) as CalendarEvent;
      return extraerMeetProvisionado(current);
    },
    async configurarEventoMeet(request, evento) {
      try {
        await finalizarProvision(meetAuth, evento, request);
      } catch (error) {
        if (provisioningAttempt || !isMemberPermissionError(error)) throw error;
        for (const legacy of await credencialesLegacy(credentials.subject)) {
          try {
            await finalizarProvision(crearGoogleMeetAuthClient(legacy), evento, request);
            return;
          } catch (legacyError) {
            if (!isMemberPermissionError(legacyError)) throw legacyError;
          }
        }
        // Existing links remain valid, but unassigned cohosts are an integration
        // failure and must be surfaced to the durable retry mechanism.
        throw error;
      }
    },
    async cancelarEvento(calendarId, externalEventId) {
      await eliminarEventoCalendarHttp(auth, calendarId, externalEventId, { sendUpdates: "none" });
    },
    async actualizarEvento(calendarId, externalEventId, request) {
      await actualizarEventoCalendarHttp(
        auth,
        calendarId,
        externalEventId,
        {
          summary: request.titulo,
          description: request.descripcion,
          start: { dateTime: request.inicio.toISOString(), timeZone: request.timezone },
          end: { dateTime: request.fin.toISOString(), timeZone: request.timezone },
        },
        { sendUpdates: "none" }
      );
    },
    compartirConferenciaCalendar(calendarId, externalEventId, conferenceData) {
      return compartirConferenciaGoogleCalendar(credentials, calendarId, externalEventId, conferenceData);
    },
    configurarMeetExistente(codigoReunion, settings) {
      return configurarGoogleMeetExistente(credentials, codigoReunion, settings);
    },
    sincronizarCohostsExistente(input) {
      return sincronizarCohostsGoogleExistente(credentials, input);
    },
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

async function crearEspacioMeetAplicacion(
  auth: ReturnType<typeof crearGoogleMeetAuthClient>,
  request: Pick<ConferenceProvisionRequest, "cohostEmails" | "requiereAsistenciaTecnica">
): Promise<Required<Pick<MeetSpace, "name" | "meetingCode" | "meetingUri">>> {
  const cohosts = normalizarEmails(request.cohostEmails ?? []);
  const created = await crearEspacioMeetHttp(auth, {
    moderation: cohosts.length > 0 ? "ON" : "OFF",
    accessType: "TRUSTED",
    ...(request.requiereAsistenciaTecnica !== undefined
      ? {
          attendanceReportGenerationType: request.requiereAsistenciaTecnica
            ? "GENERATE_REPORT"
            : "DO_NOT_GENERATE",
        }
      : {}),
  });

  const name = created.name;
  const meetingCode = created.meetingCode;
  const meetingUri = created.meetingUri;
  if (!name || !meetingCode || !meetingUri) {
    throw new Error("Google Meet no devolvió name, meetingCode y meetingUri para el nuevo espacio.");
  }

  // Configure cohosts AFTER Calendar has acknowledged the event, in the
  // existing configurarEventoMeet phase. This prevents cohost failures from
  // obscuring a successfully created remote Meet space.
  return { name, meetingCode, meetingUri };
}

async function finalizarProvision(
  auth: ReturnType<typeof crearGoogleMeetAuthClient>,
  result: ConferenceProvisionResult,
  request: ConferenceProvisionRequest
): Promise<ConferenceProvisionResult> {
  const spaceName = await configurarEspacioMeet(auth, result.codigoReunion, request);
  await configurarCohostsMeet(auth, spaceName, request.cohostEmails ?? []);
  return result;
}

async function configurarEspacioMeet(
  auth: ReturnType<typeof crearGoogleMeetAuthClient>,
  codigoReunion: string,
  request: Readonly<{ requiereAsistenciaTecnica?: boolean; cohostEmails?: readonly string[] }>
): Promise<string> {
  const configurarAsistencia = request.requiereAsistenciaTecnica !== undefined;
  const configurarModeracion = Boolean(request.cohostEmails?.length);
  const current = await obtenerEspacioMeet(auth, codigoReunion);
  if (!current.name) throw new Error("Google Meet no devolvió el ID del espacio.");

  const config = {
    ...(configurarAsistencia
      ? { attendanceReportGenerationType: request.requiereAsistenciaTecnica ? "GENERATE_REPORT" : "DO_NOT_GENERATE" }
      : {}),
    ...(configurarModeracion ? { moderation: "ON" } : {}),
  };
  const updateMask = [
    ...(configurarAsistencia ? ["config.attendance_report_generation_type"] : []),
    ...(configurarModeracion ? ["config.moderation"] : []),
  ];
  if (updateMask.length > 0) {
    await actualizarEspacioMeetHttp(auth, current.name, config, updateMask);
  }
  if (configurarModeracion) {
    const verified = await obtenerEspacioMeet(auth, current.name);
    if (verified.config?.moderation !== "ON") {
      throw new Error("Google Meet no confirmó la administración de anfitriones.");
    }
  }
  return current.name;
}

async function configurarCohostsMeet(
  auth: ReturnType<typeof crearGoogleMeetAuthClient>,
  spaceName: string,
  emails: readonly string[]
): Promise<void> {
  const desired = emailsCohost(auth.subject, emails);
  for (const email of desired) {
    try {
      await crearMiembroMeetHttp(auth, spaceName, email, "COHOST");
    } catch (error) {
      if (!isAlreadyCohostError(error)) throw error;
      const members = await listarMiembrosMeetHttp(auth, spaceName);
      const member = members.find((item) => item.email?.trim().toLowerCase() === email);
      if (!member?.name) throw new Error(`Google Meet no permitió verificar el miembro ${email}.`);
      if (member.role !== "COHOST") {
        // Avoid DELETE+POST races: Calendar can already have invited this
        // person as a regular member. Promote them atomically in place.
        await actualizarRolMiembroMeetHttp(auth, member.name, "COHOST");
      }
    }
  }
  await verificarCohostsMeet(auth, spaceName, desired);
}

async function verificarCohostsMeet(
  auth: ReturnType<typeof crearGoogleMeetAuthClient>,
  spaceName: string,
  desiredEmails: readonly string[]
): Promise<void> {
  const desired = emailsCohost(auth.subject, desiredEmails);
  if (desired.length === 0) return;
  const members = await listarMiembrosMeetHttp(auth, spaceName);
  const actual = new Set(
    members
      .filter(({ role }) => role === "COHOST")
      .flatMap(({ email }) => (email ? [email.trim().toLowerCase()] : []))
  );
  const missing = desired.filter((email) => !actual.has(email));
  if (missing.length > 0) {
    throw new Error(`Google Meet no confirmó los cohosts: ${missing.join(", ")}`);
  }
}

async function reconciliarCohostsMeet(
  auth: ReturnType<typeof crearGoogleMeetAuthClient>,
  spaceName: string,
  previousEmails: readonly string[],
  desiredEmails: readonly string[]
): Promise<void> {
  const previous = new Set(emailsCohost(auth.subject, previousEmails));
  const desired = new Set(emailsCohost(auth.subject, desiredEmails));
  const members = await listarMiembrosMeetHttp(auth, spaceName);
  const cohosts = members.filter(({ role }) => role === "COHOST");

  await Promise.all(
    cohosts.flatMap((member) => {
      const email = member.email?.trim().toLowerCase();
      if (!member.name || !email || !previous.has(email) || desired.has(email)) return [];
      return [
        eliminarMiembroMeetHttp(auth, member.name).catch((error) => {
          if (isMeetNotFoundError(error)) return;
          throw error;
        }),
      ];
    })
  );

  const existing = new Set(cohosts.flatMap(({ email }) => (email ? [email.trim().toLowerCase()] : [])));
  await configurarCohostsMeet(
    auth,
    spaceName,
    [...desired].filter((email) => !existing.has(email))
  );
  await verificarCohostsMeet(auth, spaceName, [...desired]);
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

function mismosAttendees(
  left: readonly CalendarAttendee[],
  right: readonly CalendarAttendee[]
): boolean {
  const emails = (values: readonly CalendarAttendee[]) =>
    values
      .map(({ email }) => email.trim().toLowerCase())
      .sort()
      .join(",");
  return emails(left) === emails(right);
}

function emailsCohost(subject: string | undefined, emails: readonly string[]): readonly string[] {
  return normalizarEmails(emails).filter((email) => email !== subject?.trim().toLowerCase());
}

function normalizarEmails(values: readonly string[]): readonly string[] {
  return [...new Set(values.map((value) => value.trim().toLowerCase()).filter(Boolean))];
}

