import { Prisma } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { db } from "../src/lib/db";
import { extraerConferenceData } from "../src/modules/meet/google-calendar.domain";
import {
  compartirConferenciaGoogleCalendar,
  type GoogleCalendarCredentials
} from "../src/modules/meet/google-calendar.adapter";
import { claveSerieReunion } from "../src/modules/reuniones/serie-reunion.domain";

const applyChanges = process.argv.includes("--apply");
const now = new Date();

type Meeting = Awaited<ReturnType<typeof loadMeetings>>[number];
type Plan = Readonly<{
  key: string;
  meetings: readonly Meeting[];
  anchor: Meeting;
  codes: readonly string[];
}>;

async function main(): Promise<void> {
  const plans = buildPlans(await loadMeetings());
  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    cutoff: now.toISOString(),
    seriesToFix: plans.length,
    eventsToUpdate: plans.reduce((total, plan) => total + plan.meetings.length - 1, 0),
    series: plans.map((plan) => ({
      programa: plan.meetings[0].solicitud.docentePrograma.programa.nombre,
      titulo: plan.meetings[0].solicitud.titulo,
      meetings: plan.meetings.length,
      currentCodes: plan.codes,
      sharedCode: onlyEvent(plan.anchor).codigoReunion
    }))
  }, null, 2));
  if (!applyChanges || plans.length === 0) return;

  const config = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true }
  });
  if (!config?.serviceAccountEmail || !config.privateKeyCifrada) {
    throw new Error("Google Workspace no está configurado para unificar enlaces de series.");
  }
  loadEnvConfig(process.cwd());
  const { descifrarConfiguracion } = await import("../src/lib/config/encryption");
  const privateKey = descifrarConfiguracion(config.privateKeyCifrada);

  for (const plan of plans) {
    await applyPlan(plan, config.serviceAccountEmail, privateKey);
  }
}

function loadMeetings() {
  return db.instanciaSala.findMany({
    where: {
      finProgramadoAt: { gte: now },
      estado: { not: "CANCELADA" },
      eventosProveedor: {
        some: {
          proveedor: { tipo: "GOOGLE_MEET" },
          estadoIntegracion: "SINCRONIZADA",
          externalEventId: { not: null },
          codigoReunion: { not: null },
          joinUrl: { not: null }
        }
      }
    },
    orderBy: { inicioProgramadoAt: "asc" },
    include: {
      solicitud: {
        include: { docentePrograma: { include: { programa: true } } }
      },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        include: { cuentaProveedor: true }
      }
    }
  });
}

function buildPlans(meetings: readonly Meeting[]): readonly Plan[] {
  const groups = new Map<string, Meeting[]>();
  for (const meeting of meetings) {
    const key = claveSerieReunion(meeting.solicitud);
    groups.set(key, [...(groups.get(key) ?? []), meeting]);
  }
  return [...groups.entries()].flatMap(([key, values]) => {
    const codes = unique(values.map((meeting) => onlyEvent(meeting).codigoReunion).filter(isString));
    if (codes.length <= 1) return [];
    const anchor = values.find((meeting) => extraerConferenceData(onlyEvent(meeting).payloadUltimo));
    if (!anchor) throw new Error(`La serie ${values[0].solicitud.titulo} no tiene conferenceData reutilizable.`);
    return [{ key, meetings: values, anchor, codes }];
  });
}

async function applyPlan(plan: Plan, serviceAccountEmail: string, privateKey: string): Promise<void> {
  const anchorEvent = onlyEvent(plan.anchor);
  const conferenceData = extraerConferenceData(anchorEvent.payloadUltimo);
  if (!conferenceData || !anchorEvent.codigoReunion || !anchorEvent.joinUrl) {
    throw new Error(`El evento base ${anchorEvent.id} no tiene una conferencia completa.`);
  }

  for (const meeting of plan.meetings) {
    if (meeting.id === plan.anchor.id) continue;
    const event = onlyEvent(meeting);
    const calendarId = event.cuentaProveedor?.emailOrganizador;
    if (!calendarId || !event.externalEventId) {
      throw new Error(`El evento ${event.id} no tiene conexión completa con Calendar.`);
    }
    const credentials: GoogleCalendarCredentials = {
      serviceAccountEmail,
      privateKey,
      subject: calendarId
    };
    const result = await withRateLimitRetries(() => compartirConferenciaGoogleCalendar(
      credentials,
      calendarId,
      event.externalEventId!,
      conferenceData
    ));
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flacso.meet_change_origin', 'unificar-links-series-futuras', true), set_config('flacso.meet_change_reason', 'Unificación de enlaces de la serie', true)`;
      await tx.eventoProveedor.update({
        where: { id: event.id },
        data: {
          codigoReunion: anchorEvent.codigoReunion,
          joinUrl: anchorEvent.joinUrl,
          payloadUltimo: JSON.parse(JSON.stringify(result.payload)) as Prisma.InputJsonValue,
          sincronizadoAt: new Date(),
          estadoIntegracion: "SINCRONIZADA",
          errorIntegracion: null
        }
      });
    });
  }

  await db.auditoria.create({
    data: {
      accion: "ENLACE_MEET_UNIFICADO_EN_SERIE",
      entidadTipo: "SolicitudSala",
      entidadId: plan.anchor.solicitud.id,
      valorAnterior: { codigosMeet: plan.codes },
      valorNuevo: {
        codigoMeet: anchorEvent.codigoReunion,
        encuentros: plan.meetings.length
      }
    }
  });
}

function onlyEvent(meeting: Meeting) {
  const event = meeting.eventosProveedor[0];
  if (!event) throw new Error(`El encuentro ${meeting.id} no tiene evento Google Meet.`);
  return event;
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function isString(value: string | null): value is string {
  return typeof value === "string";
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

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
