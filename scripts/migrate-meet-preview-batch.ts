import "dotenv/config";
import type { Prisma } from "@prisma/client";
import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";
import { normalizeCohostEmails } from "../src/modules/meet/cohosts.domain";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MEET_CREATED_SCOPE = "https://www.googleapis.com/auth/meetings.space.created";
const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";
const MEET_READ_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const MEET_API = "https://meet.googleapis.com/v2";
const TIMEOUT_MS = 30_000;
const MIGRATION_ACTIONS = [
  "MEET_MIGRADO_A_ESPACIO_PREVIEW",
  "MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW",
] as const;

function argValue(name: string): string | undefined {
  const prefix = `--${name}=`;
  return (
    process.argv
      .find((arg) => arg.startsWith(prefix))
      ?.slice(prefix.length)
      ?.trim() || undefined
  );
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`);
}

function requiredEnv(name: "GOOGLE_SERVICE_ACCOUNT_EMAIL" | "GOOGLE_PRIVATE_KEY"): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} es obligatorio para esta migración temporal.`);
  }
  return value;
}

function normalizePrivateKey(value: string): string {
  return value.includes("\\n") ? value.replaceAll("\\n", "\n") : value;
}

function toJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
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
  hangoutLink?: string;
  conferenceData?: CalendarConferenceData;
  [key: string]: unknown;
}>;

type MeetSpace = Readonly<{
  name?: string;
  meetingCode?: string;
  meetingUri?: string;
}>;

type MeetMember = Readonly<{
  name?: string;
  email?: string;
  role?: string;
}>;

type Meeting = Awaited<ReturnType<typeof loadMeetings>>[number];
type GoogleEvent = Meeting["eventosProveedor"][number];

type GroupPlan = Readonly<{
  oldMeetingCode: string;
  meetings: readonly Meeting[];
  organizers: readonly string[];
  anchorOrganizer: string;
  desiredCohosts: readonly string[];
  requiresAttendanceReport: boolean;
}>;

type CalendarSnapshot = Readonly<{
  meetingId: string;
  event: GoogleEvent;
  organizer: string;
  calendarUrl: string;
  previousConferenceData: CalendarConferenceData;
}>;

async function main(): Promise<void> {
  const apply = hasFlag("apply");
  const continueOnError = hasFlag("continue-on-error");
  const limitArg = argValue("limit");
  const limit = limitArg ? Number.parseInt(limitArg, 10) : undefined;
  if (limit !== undefined && (!Number.isInteger(limit) || limit <= 0)) {
    throw new Error("--limit debe ser un entero positivo.");
  }

  const serviceAccountEmail = requiredEnv("GOOGLE_SERVICE_ACCOUNT_EMAIL");
  const privateKey = normalizePrivateKey(requiredEnv("GOOGLE_PRIVATE_KEY"));
  const meetings = await loadMeetings();
  const groups = buildPlans(meetings);
  const migratedCodes = await loadMigratedCodes();
  const pending = groups.filter(({ oldMeetingCode }) => !migratedCodes.has(oldMeetingCode));
  const alreadyMigrated = groups.filter(({ oldMeetingCode }) => migratedCodes.has(oldMeetingCode));
  const selected = limit ? pending.slice(0, limit) : pending;

  console.log(
    JSON.stringify(
      {
        mode: apply ? "apply" : "dry-run",
        credentialSource: "temporary-env",
        serviceAccountEmail,
        meetingsReviewed: meetings.length,
        currentSpaces: groups.length,
        alreadyMigratedSpaces: alreadyMigrated.length,
        spacesToMigrate: pending.length,
        spacesSelected: selected.length,
        calendarEventsToPatch: selected.reduce((sum, group) => sum + group.meetings.length, 0),
        cohostAssignmentsRequested: selected.reduce(
          (sum, group) => sum + group.desiredCohosts.length,
          0,
        ),
        continueOnError,
        limit: limit ?? null,
        skippedCodes: alreadyMigrated.map(({ oldMeetingCode }) => oldMeetingCode),
        sample: selected.slice(0, 12).map((group) => ({
          oldMeetingCode: group.oldMeetingCode,
          meetings: group.meetings.length,
          organizers: group.organizers,
          anchorOrganizer: group.anchorOrganizer,
          desiredCohosts: group.desiredCohosts,
          titles: unique(group.meetings.map((meeting) => meeting.solicitud.titulo)).slice(0, 4),
        })),
      },
      null,
      2,
    ),
  );

  if (!apply || selected.length === 0) {
    return;
  }

  const migrated: Array<Record<string, unknown>> = [];
  const failures: Array<Record<string, unknown>> = [];

  for (let index = 0; index < selected.length; index += 1) {
    const group = selected[index];
    console.log(
      JSON.stringify({
        progress: `${index + 1}/${selected.length}`,
        oldMeetingCode: group.oldMeetingCode,
        meetings: group.meetings.length,
        status: "starting",
      }),
    );

    try {
      const result = await migrateGroup(serviceAccountEmail, privateKey, group);
      migrated.push(result);
      console.log(
        JSON.stringify({ ...result, progress: `${index + 1}/${selected.length}` }, null, 2),
      );
    } catch (error) {
      const failure = {
        oldMeetingCode: group.oldMeetingCode,
        meetings: group.meetings.map(({ id }) => id),
        error: errorMessage(error),
      };
      failures.push(failure);
      console.error(
        JSON.stringify({ ...failure, progress: `${index + 1}/${selected.length}` }, null, 2),
      );
      if (!continueOnError) {
        break;
      }
    }

    await sleep(750);
  }

  console.log(
    JSON.stringify(
      {
        completed: failures.length === 0 || continueOnError,
        migratedSpaces: migrated.length,
        migratedCalendarEvents: migrated.reduce(
          (sum, item) => sum + Number(item["calendarEvents"] ?? 0),
          0,
        ),
        failures: failures.length,
        failureDetails: failures,
      },
      null,
      2,
    ),
  );

  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

async function loadMigratedCodes(): Promise<Set<string>> {
  const rows = await db.auditoria.findMany({
    where: { accion: { in: [...MIGRATION_ACTIONS] } },
    select: { valorNuevo: true },
  });
  return new Set(
    rows.flatMap(({ valorNuevo }) => {
      const code = auditMeetingCode(valorNuevo);
      return code ? [code] : [];
    }),
  );
}

function auditMeetingCode(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }
  const code = (value as Record<string, unknown>)["codigoReunion"];
  return typeof code === "string" && code.trim() ? code.trim().toLowerCase() : null;
}

function loadMeetings() {
  return db.instanciaSala.findMany({
    where: {
      estado: { in: ["PROGRAMADA", "EN_CURSO"] },
      finProgramadoAt: { gte: new Date() },
      eventosProveedor: {
        some: {
          proveedor: { tipo: "GOOGLE_MEET" },
          externalEventId: { not: null },
          codigoReunion: { not: null },
          joinUrl: { not: null },
        },
      },
    },
    orderBy: { inicioProgramadoAt: "asc" },
    select: {
      id: true,
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      requiereAsistenciaTecnica: true,
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
        take: 1,
        select: {
          id: true,
          externalEventId: true,
          codigoReunion: true,
          joinUrl: true,
          payloadUltimo: true,
          cuentaProveedor: { select: { emailOrganizador: true } },
        },
      },
    },
  });
}

function buildPlans(meetings: readonly Meeting[]): readonly GroupPlan[] {
  const byCode = new Map<string, Meeting[]>();
  for (const meeting of meetings) {
    const event = onlyEvent(meeting);
    const code = event.codigoReunion?.trim().toLowerCase();
    if (!code) {
      throw new Error(`La reunión ${meeting.id} no tiene código Meet.`);
    }
    byCode.set(code, [...(byCode.get(code) ?? []), meeting]);
  }

  return [...byCode.entries()].map(([oldMeetingCode, groupMeetings]) => {
    const organizers = unique(groupMeetings.map((meeting) => organizerOf(onlyEvent(meeting))));
    const anchorOrganizer = organizerOf(onlyEvent(groupMeetings[0]));
    const desiredCohosts = normalizeCohostEmails([
      ...groupMeetings.flatMap((meeting) => desiredCohostsForMeeting(meeting)),
      ...organizers.filter((email) => email !== anchorOrganizer),
    ]).filter((email) => email !== anchorOrganizer);

    return {
      oldMeetingCode,
      meetings: groupMeetings,
      organizers,
      anchorOrganizer,
      desiredCohosts,
      requiresAttendanceReport: groupMeetings.some(
        ({ requiereAsistenciaTecnica }) => requiereAsistenciaTecnica,
      ),
    };
  });
}

function desiredCohostsForMeeting(meeting: Meeting): readonly string[] {
  const requester = meeting.solicitud.creadaPor;
  const assistants = meeting.asignaciones.map(({ asistenteTecnico }) => asistenteTecnico.usuario);
  return normalizeCohostEmails([
    ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
    ...meeting.cohostEmails.map(({ email }) => email),
    ...requester.cuentasGoogle.map(({ email }) => email),
    ...(requester.cuentasGoogle.length === 0 && requester.emailPrincipal
      ? [requester.emailPrincipal]
      : []),
    ...assistants.flatMap((assistant) => assistant.cuentasGoogle.map(({ email }) => email)),
    ...assistants.flatMap((assistant) =>
      assistant.cuentasGoogle.length === 0 && assistant.emailPrincipal
        ? [assistant.emailPrincipal]
        : [],
    ),
  ]);
}

async function migrateGroup(
  serviceAccountEmail: string,
  privateKey: string,
  group: GroupPlan,
): Promise<Record<string, unknown>> {
  const snapshots = await loadCalendarSnapshots(serviceAccountEmail, privateKey, group);
  const creatorAuth = meetAuth(serviceAccountEmail, privateKey, group.anchorOrganizer);

  const created = await withRateLimitRetries(() =>
    creatorAuth.request<MeetSpace>({
      url: `${MEET_API}/spaces`,
      method: "POST",
      timeout: TIMEOUT_MS,
      data: {
        config: {
          moderation: group.desiredCohosts.length > 0 ? "ON" : "OFF",
          accessType: "TRUSTED",
          attendanceReportGenerationType: group.requiresAttendanceReport
            ? "GENERATE_REPORT"
            : "DO_NOT_GENERATE",
        },
      },
    }),
  );

  const newSpaceName = created.data.name;
  const newMeetingCode = created.data.meetingCode;
  const newJoinUrl = created.data.meetingUri;
  if (!newSpaceName || !newMeetingCode || !newJoinUrl) {
    throw new Error(
      "Google Meet no devolvió name, meetingCode y meetingUri para el nuevo espacio.",
    );
  }

  for (const cohost of group.desiredCohosts) {
    try {
      await withRateLimitRetries(() =>
        creatorAuth.request({
          url: `${MEET_API}/${newSpaceName}/members`,
          method: "POST",
          timeout: TIMEOUT_MS,
          data: { email: cohost, role: "COHOST" },
        }),
      );
    } catch (error) {
      if (!isAlreadyExists(error)) {
        throw error;
      }
    }
  }

  const members = await listMembers(creatorAuth, newSpaceName);
  const actualCohosts = new Set(
    members
      .filter(({ role }) => role === "COHOST")
      .flatMap(({ email }) => (email ? [email.trim().toLowerCase()] : [])),
  );
  const missingCohosts = group.desiredCohosts.filter((email) => !actualCohosts.has(email));
  if (missingCohosts.length > 0) {
    throw new Error(`No se pudieron verificar los cohosts: ${missingCohosts.join(", ")}`);
  }

  const newConferenceData: CalendarConferenceData = {
    conferenceId: newMeetingCode,
    conferenceSolution: {
      key: { type: "hangoutsMeet" },
      name: "Google Meet",
    },
    entryPoints: [
      {
        entryPointType: "video",
        uri: newJoinUrl,
        label: newJoinUrl.replace(/^https?:\/\//, ""),
        meetingCode: newMeetingCode,
      },
    ],
  };

  const changed: CalendarSnapshot[] = [];
  const patchedPayloads = new Map<string, CalendarEvent>();
  try {
    for (const snapshot of snapshots) {
      const auth = calendarAuth(serviceAccountEmail, privateKey, snapshot.organizer);
      const patched = await withRateLimitRetries(() =>
        auth.request<CalendarEvent>({
          url: `${snapshot.calendarUrl}?conferenceDataVersion=1&sendUpdates=none`,
          method: "PATCH",
          timeout: TIMEOUT_MS,
          data: { conferenceData: newConferenceData },
        }),
      );
      changed.push(snapshot);

      const verified = await withRateLimitRetries(() =>
        auth.request<CalendarEvent>({
          url: `${snapshot.calendarUrl}?conferenceDataVersion=1`,
          method: "GET",
          timeout: TIMEOUT_MS,
        }),
      );
      const verifiedVideoUrl = verified.data.conferenceData?.entryPoints?.find(
        ({ entryPointType }) => entryPointType === "video",
      )?.uri;
      if (
        verified.data.hangoutLink !== newJoinUrl ||
        verified.data.conferenceData?.conferenceId !== newMeetingCode ||
        verifiedVideoUrl !== newJoinUrl
      ) {
        throw new Error(`Calendar no confirmó el nuevo Meet para ${snapshot.meetingId}.`);
      }
      patchedPayloads.set(snapshot.event.id, patched.data);
    }

    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flacso.meet_change_origin', 'migrate-meet-preview-batch', true), set_config('flacso.meet_change_reason', 'Migración de grupo a un espacio Meet Preview', true)`;
      for (const snapshot of snapshots) {
        const payload = patchedPayloads.get(snapshot.event.id);
        if (!payload) {
          throw new Error(`Falta payload Calendar para ${snapshot.meetingId}.`);
        }
        await tx.eventoProveedor.update({
          where: { id: snapshot.event.id },
          data: {
            codigoReunion: newMeetingCode,
            joinUrl: newJoinUrl,
            payloadUltimo: toJson(payload),
            sincronizadoAt: new Date(),
            estadoIntegracion: "SINCRONIZADA",
            operacionPendiente: null,
            errorIntegracion: null,
            conferenceRecordName: null,
            archivosSincronizadosAt: null,
            errorArchivos: null,
          },
        });
      }

      await tx.auditoria.create({
        data: {
          accion: "MEET_GRUPO_MIGRADO_A_ESPACIO_PREVIEW",
          entidadTipo: "InstanciaSala",
          entidadId: group.meetings[0].id,
          valorAnterior: toJson({
            codigoReunion: group.oldMeetingCode,
            encuentros: group.meetings.map(({ id }) => id),
            organizadores: group.organizers,
          }),
          valorNuevo: toJson({
            codigoReunion: newMeetingCode,
            joinUrl: newJoinUrl,
            spaceName: newSpaceName,
            encuentros: group.meetings.map(({ id }) => id),
            cohosts: group.desiredCohosts,
          }),
        },
      });
    });
  } catch (error) {
    const rollbackFailures = await rollbackCalendar(serviceAccountEmail, privateKey, changed);
    if (rollbackFailures.length > 0) {
      console.error(
        JSON.stringify(
          {
            critical: true,
            oldMeetingCode: group.oldMeetingCode,
            newMeetingCode,
            rollbackFailures,
          },
          null,
          2,
        ),
      );
    }
    throw error;
  }

  return {
    migrated: true,
    oldMeetingCode: group.oldMeetingCode,
    newSpaceName,
    newMeetingCode,
    newJoinUrl,
    calendarEvents: snapshots.length,
    organizers: group.organizers,
    cohostsVerified: group.desiredCohosts,
  };
}

async function loadCalendarSnapshots(
  serviceAccountEmail: string,
  privateKey: string,
  group: GroupPlan,
): Promise<readonly CalendarSnapshot[]> {
  const snapshots: CalendarSnapshot[] = [];
  for (const meeting of group.meetings) {
    const event = onlyEvent(meeting);
    const organizer = organizerOf(event);
    if (!event.externalEventId) {
      throw new Error(`La reunión ${meeting.id} no tiene externalEventId.`);
    }
    const calendarUrl = `${CALENDAR_API}/calendars/${encodeURIComponent(organizer)}/events/${encodeURIComponent(event.externalEventId)}`;
    const auth = calendarAuth(serviceAccountEmail, privateKey, organizer);
    const current = await withRateLimitRetries(() =>
      auth.request<CalendarEvent>({
        url: `${calendarUrl}?conferenceDataVersion=1`,
        method: "GET",
        timeout: TIMEOUT_MS,
      }),
    );
    const previousConferenceData = current.data.conferenceData;
    const currentCode = previousConferenceData?.conferenceId?.trim().toLowerCase();
    if (!previousConferenceData || currentCode !== group.oldMeetingCode) {
      throw new Error(
        `Calendar y la base no coinciden para ${meeting.id}: esperado ${group.oldMeetingCode}, recibido ${currentCode ?? "sin código"}.`,
      );
    }
    snapshots.push({
      meetingId: meeting.id,
      event,
      organizer,
      calendarUrl,
      previousConferenceData,
    });
  }
  return snapshots;
}

async function rollbackCalendar(
  serviceAccountEmail: string,
  privateKey: string,
  changed: readonly CalendarSnapshot[],
): Promise<readonly Record<string, unknown>[]> {
  const failures: Array<Record<string, unknown>> = [];
  for (const snapshot of [...changed].reverse()) {
    const auth = calendarAuth(serviceAccountEmail, privateKey, snapshot.organizer);
    try {
      await withRateLimitRetries(() =>
        auth.request({
          url: `${snapshot.calendarUrl}?conferenceDataVersion=1&sendUpdates=none`,
          method: "PATCH",
          timeout: TIMEOUT_MS,
          data: { conferenceData: snapshot.previousConferenceData },
        }),
      );
    } catch (error) {
      failures.push({ meetingId: snapshot.meetingId, error: errorMessage(error) });
    }
  }
  return failures;
}

async function listMembers(auth: JWT, spaceName: string): Promise<readonly MeetMember[]> {
  const members: MeetMember[] = [];
  let pageToken: string | undefined;
  do {
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) {
      query.set("pageToken", pageToken);
    }
    const response = await withRateLimitRetries(() =>
      auth.request<{
        members?: readonly MeetMember[];
        nextPageToken?: string;
      }>({
        url: `${MEET_API}/${spaceName}/members?${query.toString()}`,
        method: "GET",
        timeout: TIMEOUT_MS,
      }),
    );
    members.push(...(response.data.members ?? []));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return members;
}

function onlyEvent(meeting: Meeting): GoogleEvent {
  const event = meeting.eventosProveedor[0];
  if (!event) {
    throw new Error(`La reunión ${meeting.id} no tiene evento Google Meet.`);
  }
  return event;
}

function organizerOf(event: GoogleEvent): string {
  const organizer = event.cuentaProveedor?.emailOrganizador?.trim().toLowerCase();
  if (!organizer) {
    throw new Error(`El evento ${event.id} no tiene organizador.`);
  }
  return organizer;
}

function calendarAuth(serviceAccountEmail: string, privateKey: string, subject: string): JWT {
  return new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    subject,
    scopes: [CALENDAR_SCOPE],
  });
}

function meetAuth(serviceAccountEmail: string, privateKey: string, subject: string): JWT {
  return new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    subject,
    scopes: [MEET_CREATED_SCOPE, MEET_SETTINGS_SCOPE, MEET_READ_SCOPE],
  });
}

async function withRateLimitRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const delay of [0, 1000, 2000, 4000, 8000]) {
    if (delay) {
      await sleep(delay);
    }
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRateLimit(error)) {
        throw error;
      }
    }
  }
  throw lastError;
}

function statusOf(error: unknown): number | undefined {
  if (!error || typeof error !== "object") {
    return undefined;
  }
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  const raw = candidate.response?.status ?? candidate.code;
  return typeof raw === "number" ? raw : undefined;
}

function isRateLimit(error: unknown): boolean {
  return statusOf(error) === 429;
}

function isAlreadyExists(error: unknown): boolean {
  if (statusOf(error) === 409) {
    return true;
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { response?: { data?: unknown } };
  return JSON.stringify(candidate.response?.data ?? "").includes("ALREADY_EXISTS");
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  return String(error);
}

main()
  .catch((error) => {
    console.error(errorMessage(error));
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
