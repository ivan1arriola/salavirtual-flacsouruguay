import { normalizeMeetLink } from "../src/modules/meet/meet-link.domain";
import { Prisma } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";

const solicitudId = argumentValue("--solicitud");
const meetUrl = normalizeMeetUrl(argumentValue("--meet-url"));
const applyChanges = process.argv.includes("--apply");
const meetCode = meetUrl.split("/").at(-1)!;
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const MEET_READ_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";

async function main(): Promise<void> {
  const request = await db.solicitudSala.findUnique({
    where: { id: solicitudId },
    select: { id: true, titulo: true, docenteProgramaId: true, createdAt: true }
  });
  if (!request) throw new Error(`No existe la solicitud ${solicitudId}.`);
  const meetings = await db.instanciaSala.findMany({
    where: {
      solicitud: {
        docenteProgramaId: request.docenteProgramaId,
        titulo: request.titulo,
        createdAt: request.createdAt
      }
    },
    orderBy: { inicioProgramadoAt: "asc" },
    include: {
      solicitud: { select: { id: true } },
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        include: { cuentaProveedor: true }
      }
    }
  });
  if (meetings.length === 0) throw new Error("La serie no tiene encuentros Google Meet.");
  const events = meetings.map((meeting) => {
    const event = meeting.eventosProveedor[0];
    if (!event?.externalEventId || !event.cuentaProveedor?.emailOrganizador) {
      throw new Error(`El encuentro ${meeting.id} no tiene conexión completa con Calendar.`);
    }
    return { meeting, event, calendarId: event.cuentaProveedor.emailOrganizador };
  });
  loadEnvConfig(process.cwd());
  const { descifrarConfiguracion } = await import("../src/lib/config/encryption");
  const { obtenerCredencialPrincipalGoogleWorkspace } = await import("../src/modules/configuracion/api");
  const configuration = await obtenerCredencialPrincipalGoogleWorkspace(db, descifrarConfiguracion, { requireActiva: true });
  if (!configuration) {
    throw new Error("Google Workspace no está configurado.");
  }
  const privateKey = configuration.privateKey;
  await verifyMeetSpace(configuration.serviceAccountEmail, privateKey, events[0].calendarId);

  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    solicitudId,
    titulo: request.titulo,
    meetCode,
    meetUrl,
    encuentros: events.map(({ meeting, event, calendarId }) => ({
      instanciaId: meeting.id,
      solicitudId: meeting.solicitud.id,
      inicio: meeting.inicioProgramadoAt,
      calendarId,
      externalEventId: event.externalEventId,
      enlaceAnterior: event.joinUrl
    }))
  }, null, 2));
  if (!applyChanges) return;

  const updatedPayloads = new Map<string, Prisma.InputJsonValue>();
  for (const { event, calendarId } of events) {
    const auth = calendarAuth(configuration.serviceAccountEmail, privateKey, calendarId);
    const current = await auth.request<CalendarEvent>({
      url: calendarEventUrl(calendarId, event.externalEventId!),
      method: "GET"
    });
    const description = withMeetAccess(current.data.description, meetUrl);
    const updated = await auth.request<CalendarEvent>({
      url: `${calendarEventUrl(calendarId, event.externalEventId!)}?conferenceDataVersion=1&sendUpdates=all`,
      method: "PATCH",
      data: {
        conferenceData: null,
        location: meetUrl,
        description
      }
    });
    if (updated.data.hangoutLink || updated.data.location !== meetUrl) {
      throw new Error(`Calendar no confirmó la sustitución del enlace en ${event.externalEventId}.`);
    }
    updatedPayloads.set(event.id, JSON.parse(JSON.stringify(updated.data)) as Prisma.InputJsonValue);
  }

  await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT set_config('flacso.meet_change_origin', 'asignar-link-meet-serie', true), set_config('flacso.meet_change_reason', 'Asignación de enlace a la serie', true)`;
    for (const { event } of events) {
      await tx.eventoProveedor.update({
        where: { id: event.id },
        data: {
          codigoReunion: meetCode,
          joinUrl: meetUrl,
          payloadUltimo: updatedPayloads.get(event.id),
          sincronizadoAt: new Date(),
          estadoIntegracion: "SINCRONIZADA",
          errorIntegracion: null
        }
      });
    }
    await tx.auditoria.create({
      data: {
        accion: "ENLACE_MEET_ASIGNADO_A_SERIE",
        entidadTipo: "SolicitudSala",
        entidadId: request.id,
        valorAnterior: {
          codigosMeet: [...new Set(events.map(({ event }) => event.codigoReunion).filter(Boolean))]
        },
        valorNuevo: { codigoMeet: meetCode, meetUrl, encuentros: events.length }
      }
    });
  });
}

type CalendarEvent = Readonly<{
  description?: string;
  hangoutLink?: string;
  location?: string;
  [key: string]: unknown;
}>;

function calendarAuth(serviceAccountEmail: string, privateKey: string, subject: string): JWT {
  return new JWT({ email: serviceAccountEmail, key: privateKey, scopes: [CALENDAR_SCOPE], subject });
}

async function verifyMeetSpace(
  serviceAccountEmail: string,
  privateKey: string,
  subject: string
): Promise<void> {
  const auth = new JWT({
    email: serviceAccountEmail,
    key: privateKey,
    scopes: [MEET_READ_SCOPE],
    subject
  });
  const result = await auth.request<{ meetingCode?: string; meetingUri?: string }>({
    url: `https://meet.googleapis.com/v2/spaces/${encodeURIComponent(meetCode)}`,
    method: "GET"
  });
  if (result.data.meetingCode !== meetCode || result.data.meetingUri !== meetUrl) {
    throw new Error("Google Meet no confirmó el espacio solicitado.");
  }
}

function calendarEventUrl(calendarId: string, eventId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
}

function withMeetAccess(description: string | undefined, url: string): string {
  const remaining = (description ?? "")
    .split("\n")
    .filter((line) => !/^Acceso Google Meet:/i.test(line.trim()))
    .join("\n")
    .trim();
  return [remaining, `Acceso Google Meet: ${url}`].filter(Boolean).join("\n\n");
}

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function normalizeMeetUrl(value: string): string {
  const link = normalizeMeetLink(value);
  if (!link) throw new Error("El enlace de Google Meet no es válido.");
  return link.url;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
