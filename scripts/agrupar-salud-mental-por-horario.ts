import { Prisma } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { db } from "../src/lib/db";
import { extraerConferenceData } from "../src/modules/meet/google-calendar.domain";
import {
  compartirConferenciaGoogleCalendar,
  crearGoogleCalendarProvider,
  type GoogleCalendarCredentials
} from "../src/modules/meet/google-calendar.adapter";
import { recalcularSolicitud } from "../src/modules/reuniones/encuentros-persistence.adapter";

const applyChanges = process.argv.includes("--apply");
const cutoff = new Date("2026-08-11T03:00:00.000Z");
const programName = "Programa Salud Mental";
const meetingTitle = "Diploma Salud Mental, subjetividad y trabajo";
const scheduleNames = new Map([
  ["3-18:30", "Miércoles 18:30"],
  ["6-10:00", "Sábados 10:00"]
]);

type Candidate = Awaited<ReturnType<typeof loadCandidates>>[number];
type GroupPlan = Readonly<{
  schedule: string;
  target: Candidate;
  retained: readonly Candidate[];
  duplicates: readonly Candidate[];
}>;

async function main(): Promise<void> {
  const candidates = await loadCandidates();
  if (candidates.length === 0) {
    console.log(JSON.stringify({ mode: applyChanges ? "apply" : "dry-run", status: "already-grouped" }, null, 2));
    return;
  }
  const plans = buildPlans(candidates);
  validatePlans(plans, candidates);

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    cutoff: cutoff.toISOString(),
    groups: plans.map((plan) => ({
      schedule: plan.schedule,
      targetRequestId: plan.target.id,
      meetings: plan.retained.map(summary),
      duplicatesToCancel: plan.duplicates.map(summary)
    }))
  }, null, 2));
  if (!applyChanges) return;

  const config = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true }
  });
  if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
    throw new Error("Google Workspace no está configurado para reagrupar los eventos.");
  }
  loadEnvConfig(process.cwd());
  const { descifrarConfiguracion } = await import("../src/lib/config/encryption");
  const privateKey = descifrarConfiguracion(config.privateKeyCifrada);

  for (const plan of plans) {
    await applyPlan(plan, config.serviceAccountEmail, privateKey);
  }
}

function loadCandidates() {
  return db.solicitudSala.findMany({
    where: {
      titulo: meetingTitle,
      tipoInstancias: "UNICA",
      fechaInicioSolicitada: { gte: cutoff },
      docentePrograma: { programa: { nombre: programName } }
    },
    orderBy: [{ fechaInicioSolicitada: "asc" }, { createdAt: "asc" }, { id: "asc" }],
    include: {
      instancias: {
        include: {
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            include: { cuentaProveedor: true }
          }
        }
      }
    }
  });
}

function buildPlans(candidates: readonly Candidate[]): readonly GroupPlan[] {
  const groups = new Map<string, Candidate[]>();
  for (const candidate of candidates) {
    const meeting = onlyMeeting(candidate);
    const key = scheduleKey(meeting.inicioProgramadoAt);
    groups.set(key, [...(groups.get(key) ?? []), candidate]);
  }
  return [...groups.entries()].map(([key, values]) => {
    const schedule = scheduleNames.get(key);
    if (!schedule) throw new Error(`Horario inesperado en las solicitudes individuales: ${key}.`);
    const byStart = new Map<string, Candidate[]>();
    for (const value of values) {
      const start = onlyMeeting(value).inicioProgramadoAt.toISOString();
      byStart.set(start, [...(byStart.get(start) ?? []), value]);
    }
    const retained: Candidate[] = [];
    const duplicates: Candidate[] = [];
    for (const sameStart of byStart.values()) {
      const ordered = [...sameStart].sort((left, right) =>
        left.createdAt.getTime() - right.createdAt.getTime() || left.id.localeCompare(right.id)
      );
      retained.push(ordered[0]);
      duplicates.push(...ordered.slice(1));
    }
    retained.sort((left, right) =>
      onlyMeeting(left).inicioProgramadoAt.getTime() - onlyMeeting(right).inicioProgramadoAt.getTime()
    );
    return { schedule, target: retained[0], retained, duplicates };
  }).sort((left, right) => left.schedule.localeCompare(right.schedule));
}

function validatePlans(plans: readonly GroupPlan[], candidates: readonly Candidate[]): void {
  if (plans.length !== 2) throw new Error(`Se esperaban dos horarios y se encontraron ${plans.length}.`);
  const planned = plans.reduce((total, plan) => total + plan.retained.length + plan.duplicates.length, 0);
  if (planned !== candidates.length) throw new Error("No todas las solicitudes quedaron incluidas en el plan.");
  for (const candidate of candidates) {
    if (candidate.instancias.length !== 1) throw new Error(`La solicitud ${candidate.id} no es realmente individual.`);
    const event = onlyEvent(candidate);
    if (!event.externalEventId || !event.codigoReunion || !event.joinUrl || !event.cuentaProveedor?.emailOrganizador) {
      throw new Error(`La solicitud ${candidate.id} no tiene un evento Google Meet sincronizado completo.`);
    }
  }
}

async function applyPlan(
  plan: GroupPlan,
  serviceAccountEmail: string,
  privateKey: string
): Promise<void> {
  const targetEvent = onlyEvent(plan.target);
  const conferenceData = extraerConferenceData(targetEvent.payloadUltimo);
  if (!conferenceData) throw new Error(`El evento base ${targetEvent.id} no contiene conferenceData.`);

  const synchronized = new Map<string, Prisma.InputJsonValue>();
  for (const candidate of plan.retained.slice(1)) {
    const event = onlyEvent(candidate);
    const { calendarId, externalEventId } = calendarConnection(event, candidate.id);
    const credentials = credentialsFor(serviceAccountEmail, privateKey, calendarId);
    const result = await withRateLimitRetries(() => compartirConferenciaGoogleCalendar(
      credentials,
      calendarId,
      externalEventId,
      conferenceData
    ));
    synchronized.set(event.id, JSON.parse(JSON.stringify(result.payload)) as Prisma.InputJsonValue);
  }

  for (const duplicate of plan.duplicates) {
    const event = onlyEvent(duplicate);
    const { calendarId, externalEventId } = calendarConnection(event, duplicate.id);
    const credentials = credentialsFor(serviceAccountEmail, privateKey, calendarId);
    try {
      await withRateLimitRetries(() => crearGoogleCalendarProvider(credentials).cancelarEvento(
        calendarId,
        externalEventId
      ));
    } catch (error) {
      if (!isMissingCalendarEvent(error)) throw error;
    }
  }

  await db.$transaction(async (tx) => {
    for (const [index, candidate] of plan.retained.entries()) {
      const meeting = onlyMeeting(candidate);
      await tx.instanciaSala.update({
        where: { id: meeting.id },
        data: {
          solicitudSalaId: plan.target.id,
          ordinal: index + 1,
          descripcion: candidate.descripcion
        }
      });
      const payload = synchronized.get(onlyEvent(candidate).id);
      if (payload) {
        await tx.eventoProveedor.update({
          where: { id: onlyEvent(candidate).id },
          data: {
            codigoReunion: targetEvent.codigoReunion,
            joinUrl: targetEvent.joinUrl,
            payloadUltimo: payload,
            sincronizadoAt: new Date(),
            estadoIntegracion: "SINCRONIZADA",
            errorIntegracion: null
          }
        });
      }
    }

    const sourceIds = [
      ...plan.retained.slice(1).map(({ id }) => id),
      ...plan.duplicates.map(({ id }) => id)
    ];
    await tx.solicitudSala.deleteMany({ where: { id: { in: sourceIds } } });
    await recalcularSolicitud(tx, plan.target.id);
    await tx.auditoria.create({
      data: {
        accion: "SOLICITUDES_AGRUPADAS_POR_HORARIO",
        entidadTipo: "SolicitudSala",
        entidadId: plan.target.id,
        valorAnterior: {
          solicitudes: [plan.target.id, ...sourceIds],
          duplicados: plan.duplicates.map(({ id }) => id)
        },
        valorNuevo: {
          horario: plan.schedule,
          encuentros: plan.retained.length,
          codigoMeet: targetEvent.codigoReunion
        }
      }
    });
  }, { timeout: 30000 });
}

function onlyMeeting(candidate: Candidate) {
  const meeting = candidate.instancias[0];
  if (!meeting) throw new Error(`La solicitud ${candidate.id} no tiene encuentros.`);
  return meeting;
}

function onlyEvent(candidate: Candidate) {
  const event = onlyMeeting(candidate).eventosProveedor[0];
  if (!event) throw new Error(`La solicitud ${candidate.id} no tiene evento Google Meet.`);
  return event;
}

function calendarConnection(event: ReturnType<typeof onlyEvent>, requestId: string) {
  const calendarId = event.cuentaProveedor?.emailOrganizador;
  const externalEventId = event.externalEventId;
  if (!calendarId || !externalEventId) {
    throw new Error(`La solicitud ${requestId} no tiene conexión completa con Calendar.`);
  }
  return { calendarId, externalEventId };
}

function scheduleKey(value: Date): string {
  const local = new Date(value.getTime() - 3 * 60 * 60 * 1000);
  return `${local.getUTCDay()}-${String(local.getUTCHours()).padStart(2, "0")}:${String(local.getUTCMinutes()).padStart(2, "0")}`;
}

function summary(candidate: Candidate) {
  const meeting = onlyMeeting(candidate);
  return {
    requestId: candidate.id,
    start: meeting.inicioProgramadoAt.toISOString(),
    meet: onlyEvent(candidate).codigoReunion
  };
}

function credentialsFor(serviceAccountEmail: string, privateKey: string, subject: string): GoogleCalendarCredentials {
  return { serviceAccountEmail, privateKey, subject };
}

async function withRateLimitRetries<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (const delay of [0, 1000, 2000, 4000, 8000]) {
    if (delay) await new Promise((resolve) => setTimeout(resolve, delay));
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRateLimit(error)) throw error;
    }
  }
  throw lastError;
}

function isRateLimit(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  return candidate.code === 429 || candidate.response?.status === 429;
}

function isMissingCalendarEvent(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as { code?: unknown; response?: { status?: unknown } };
  return [404, 410].includes(Number(candidate.code)) || [404, 410].includes(Number(candidate.response?.status));
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
