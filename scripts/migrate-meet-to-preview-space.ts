import "dotenv/config";
import { Prisma } from "@prisma/client";
import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";
import { normalizeCohostEmails } from "../src/modules/meet/cohosts.domain";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MEET_CREATED_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";
const MEET_READ_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";
const MEET_BETA_API = "https://meet.googleapis.com/v2beta";
const TIMEOUT_MS = 30_000;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length)?.trim() || undefined;
}

function requiredArg(name: string): string {
  const value = argValue(name);
  if (!value) throw new Error(`Falta --${name}=...`);
  return value;
}

function requiredEnv(name: "GOOGLE_SERVICE_ACCOUNT_EMAIL" | "GOOGLE_PRIVATE_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} es obligatorio para esta migración temporal.`);
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

type CalendarConferenceData = Readonly<{
  conferenceId?: string;
  conferenceSolution?: Readonly<{
    key?: Readonly<{ type?: string }>;
    name?: string;
    iconUri?: string;
  }>;
  entryPoints?: readonly Readonly<{
    entryPointType?: string;
    uri?: string;
    label?: string;
    pin?: string;
    accessCode?: string;
    meetingCode?: string;
    passcode?: string;
    password?: string;
  }>[];
  conferenceIdType?: string;
  signature?: string;
  notes?: string;
}>;

type CalendarEvent = Readonly<{
  id?: string;
  etag?: string;
  htmlLink?: string;
  hangoutLink?: string;
  conferenceData?: CalendarConferenceData;
  attendees?: readonly Readonly<{ email?: string; responseStatus?: string; organizer?: boolean; self?: boolean }>[];
  [key: string]: unknown;
}>;

type MeetSpace = Readonly<{
  name?: string;
  meetingCode?: string;
  meetingUri?: string;
}>;

async function main(): Promise<void> {
  const apply = process.argv.includes("--apply");
  const meetingId = requiredArg("meeting");
  const sendUpdates = argValue("send-updates") ?? "none";
  if (!new Set(["none", "all", "externalOnly"]).has(sendUpdates)) {
    throw new Error("--send-updates debe ser none, all o externalOnly.");
  }

  const serviceAccountEmail = requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = normalizePrivateKey(requiredEnv("GOOGLE_PRIVATE_KEY"));

  const meeting = await db.instanciaSala.findUnique({
    where: { id: meetingId },
    select: {
      id: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      requiereAsistenciaTecnica: true,
      estado: true,
      solicitud: {
        select: {
          id: true,
          titulo: true,
          creadaPor: {
            select: {
              emailPrincipal: true,
              cuentasGoogle: { select: { email: true } },
            },
          },
        },
      },
      asignaciones: {
        where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
        select: {
          asistenteTecnico: {
            select: {
              usuario: {
                select: {
                  emailPrincipal: true,
                  cuentasGoogle: { select: { email: true } },
                },
              },
            },
          },
        },
      },
      cohosts: { select: { cuentaGoogle: { select: { email: true } } } },
      cohostEmails: { select: { email: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: {
          id: true,
          externalEventId: true,
          codigoReunion: true,
          joinUrl: true,
          payloadUltimo: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
        },
        take: 1,
      },
    },
  });

  if (!meeting) throw new Error(`No existe la reunión ${meetingId}.`);
  if (!new Set(["PROGRAMADA", "EN_CURSO"]).has(meeting.estado)) {
    throw new Error(`La reunión ${meetingId} no está activa.`);
  }

  const event = meeting.eventosProveedor[0];
  const organizer = event?.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
  if (!event?.id || !event.externalEventId || !organizer) {
    throw new Error("La reunión no tiene conexión completa con Google Calendar.");
  }

  const requester = meeting.solicitud.creadaPor;
  const assistants = meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario);
  const desiredCohosts = normalizeCohostEmails([
    ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
    ...meeting.cohostEmails.map(({ email }) => email),
    ...requester.cuentasGoogle.map(({ email }) => email),
    ...(requester.cuentasGoogle.length === 0 && requester.emailPrincipal ? [requester.emailPrincipal] : []),
    ...assistants.flatMap((assistant) => assistant.cuentasGoogle.map(({ email }) => email)),
    ...assistants.flatMap((assistant) =>
      assistant.cuentasGoogle.length === 0 && assistant.emailPrincipal ? [assistant.emailPrincipal] : []
    ),
  ]).filter((email) => email !== organizer);

  const calendarAuth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    subject: organizer,
    scopes: [CALENDAR_SCOPE],
  });
  const meetAuth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    subject: organizer,
    scopes: [MEET_CREATED_SCOPE, MEET_SETTINGS_SCOPE, MEET_READ_SCOPE],
  });

  const calendarUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(organizer)}/events/${encodeURIComponent(event.externalEventId)}`;
  const currentCalendar = await calendarAuth.request<CalendarEvent>({
    url: `${calendarUrl}?conferenceDataVersion=1`,
    method: "GET",
    timeout: TIMEOUT_MS,
  });

  const previousConferenceData = currentCalendar.data.conferenceData;
  const previousJoinUrl = currentCalendar.data.hangoutLink ?? event.joinUrl ?? null;
  const previousMeetingCode = previousConferenceData?.conferenceId ?? event.codigoReunion ?? null;

  console.log(JSON.stringify({
    mode: apply ? "apply" : "dry-run",
    credentialSource: "temporary-env",
    serviceAccountEmail,
    meetingId: meeting.id,
    solicitudId: meeting.solicitud.id,
    titulo: meeting.solicitud.titulo,
    inicio: meeting.inicioProgramadoAt.toISOString(),
    fin: meeting.finProgramadoAt.toISOString(),
    organizer,
    calendarEventId: event.externalEventId,
    previousMeetingCode,
    previousJoinUrl,
    desiredCohosts,
    sendUpdates,
    willCreateNewMeetSpace: true,
    willKeepCalendarEvent: true,
    willReplaceConferenceData: true,
    willUpdateDatabaseAfterCalendarVerification: true,
  }, null, 2));

  if (!apply) return;

  const created = await meetAuth.request<MeetSpace>({
    url: `${MEET_API}/spaces`,
    method: "POST",
    timeout: TIMEOUT_MS,
    data: {
      config: {
        moderation: desiredCohosts.length > 0 ? "ON" : "OFF",
        accessType: "TRUSTED",
        attendanceReportGenerationType: meeting.requiereAsistenciaTecnica ? "GENERATE_REPORT" : "DO_NOT_GENERATE",
      },
    },
  });

  const newSpaceName = created.data.name;
  const newMeetingCode = created.data.meetingCode;
  const newJoinUrl = created.data.meetingUri;
  if (!newSpaceName || !newMeetingCode || !newJoinUrl) {
    throw new Error("Google Meet no devolvió name, meetingCode y meetingUri para el nuevo espacio.");
  }

  for (const cohost of desiredCohosts) {
    await meetAuth.request({
      url: `${MEET_BETA_API}/${newSpaceName}/members`,
      method: "POST",
      timeout: TIMEOUT_MS,
      data: { email: cohost, role: "COHOST" },
    });
  }

  const listed = await meetAuth.request<{ members?: Array<{ email?: string; role?: string }> }>({
    url: `${MEET_BETA_API}/${newSpaceName}/members?pageSize=100`,
    method: "GET",
    timeout: TIMEOUT_MS,
  });
  const actualCohosts = new Set(
    (listed.data.members ?? [])
      .filter(({ role }) => role === "COHOST")
      .flatMap(({ email }) => email ? [email.trim().toLowerCase()] : [])
  );
  const missingCohosts = desiredCohosts.filter((email) => !actualCohosts.has(email));
  if (missingCohosts.length > 0) {
    throw new Error(`No se pudieron verificar los cohosts: ${missingCohosts.join(", ")}`);
  }

  const newConferenceData: CalendarConferenceData = {
    conferenceId: newMeetingCode,
    conferenceSolution: {
      key: { type: "hangoutsMeet" },
      name: "Google Meet",
    },
    entryPoints: [{
      entryPointType: "video",
      uri: newJoinUrl,
      label: newJoinUrl.replace(/^https?:\/\//, ""),
      meetingCode: newMeetingCode,
    }],
  };

  let calendarChanged = false;
  try {
    const patched = await calendarAuth.request<CalendarEvent>({
      url: `${calendarUrl}?conferenceDataVersion=1&sendUpdates=${encodeURIComponent(sendUpdates)}`,
      method: "PATCH",
      timeout: TIMEOUT_MS,
      data: { conferenceData: newConferenceData },
    });
    calendarChanged = true;

    const verified = await calendarAuth.request<CalendarEvent>({
      url: `${calendarUrl}?conferenceDataVersion=1`,
      method: "GET",
      timeout: TIMEOUT_MS,
    });

    const verifiedVideoUrl = verified.data.conferenceData?.entryPoints?.find(
      ({ entryPointType }) => entryPointType === "video"
    )?.uri;
    if (
      verified.data.hangoutLink !== newJoinUrl ||
      verified.data.conferenceData?.conferenceId !== newMeetingCode ||
      verifiedVideoUrl !== newJoinUrl
    ) {
      throw new Error("Calendar no confirmó completamente el nuevo espacio de Google Meet.");
    }

    await db.$transaction(async (tx) => {
      await tx.eventoProveedor.update({
        where: { id: event.id },
        data: {
          codigoReunion: newMeetingCode,
          joinUrl: newJoinUrl,
          payloadUltimo: toJson(patched.data),
          sincronizadoAt: new Date(),
          estadoIntegracion: "SINCRONIZADA",
          operacionPendiente: null,
          errorIntegracion: null,
          conferenceRecordName: null,
          archivosSincronizadosAt: null,
          errorArchivos: null,
        },
      });

      await tx.auditoria.create({
        data: {
          accion: "MEET_MIGRADO_A_ESPACIO_PREVIEW",
          entidadTipo: "InstanciaSala",
          entidadId: meeting.id,
          valorAnterior: toJson({
            codigoReunion: previousMeetingCode,
            joinUrl: previousJoinUrl,
            calendarEventId: event.externalEventId,
          }),
          valorNuevo: toJson({
            codigoReunion: newMeetingCode,
            joinUrl: newJoinUrl,
            calendarEventId: event.externalEventId,
            spaceName: newSpaceName,
            cohosts: desiredCohosts,
            sendUpdates,
          }),
        },
      });
    });

    console.log(JSON.stringify({
      migrated: true,
      meetingId: meeting.id,
      calendarEventId: event.externalEventId,
      calendarEventPreserved: true,
      previousMeetingCode,
      previousJoinUrl,
      newSpaceName,
      newMeetingCode,
      newJoinUrl,
      cohostsVerified: desiredCohosts,
      sendUpdates,
    }, null, 2));
  } catch (error) {
    if (calendarChanged && previousConferenceData) {
      try {
        await calendarAuth.request({
          url: `${calendarUrl}?conferenceDataVersion=1&sendUpdates=none`,
          method: "PATCH",
          timeout: TIMEOUT_MS,
          data: { conferenceData: previousConferenceData },
        });
        console.error(JSON.stringify({
          rollbackCalendar: true,
          restoredMeetingCode: previousMeetingCode,
          restoredJoinUrl: previousJoinUrl,
        }, null, 2));
      } catch (rollbackError) {
        console.error(JSON.stringify({
          rollbackCalendar: false,
          critical: true,
          previousMeetingCode,
          previousJoinUrl,
          rollbackError: rollbackError instanceof Error ? rollbackError.message : String(rollbackError),
        }, null, 2));
      }
    }
    throw error;
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
