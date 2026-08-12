import { Prisma } from "@prisma/client";
import { loadEnvConfig } from "@next/env";
import { JWT } from "google-auth-library";
import { db } from "../src/lib/db";

const solicitudId = argumentValue("--solicitud");
const desiredEmails = argumentValues("--cohost").map(normalizeEmail);
const removedEmails = argumentValues("--quitar").map(normalizeEmail);
const applyChanges = process.argv.includes("--apply");
const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";

async function main(): Promise<void> {
  if (desiredEmails.length === 0) throw new Error("Indicá al menos un --cohost.");
  if (desiredEmails.some((email) => removedEmails.includes(email))) {
    throw new Error("Una dirección no puede agregarse y quitarse a la vez.");
  }
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
      cohosts: { include: { cuentaGoogle: true } },
      cohostEmails: true,
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        include: { cuentaProveedor: true },
        take: 1
      }
    }
  });
  if (meetings.length === 0) throw new Error("La serie no tiene encuentros.");
  const googleAccounts = await db.cuentaGoogleFlacso.findMany({
    where: { email: { in: desiredEmails } },
    select: { id: true, email: true }
  });
  const linkedByEmail = new Map(googleAccounts.map((account) => [normalizeEmail(account.email), account.id]));

  const configuration = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true }
  });
  if (!configuration?.serviceAccountEmail || !configuration.privateKeyCifrada) {
    throw new Error("Google Workspace no está configurado.");
  }
  loadEnvConfig(process.cwd());
  const { descifrarConfiguracion } = await import("../src/lib/config/encryption");
  const privateKey = descifrarConfiguracion(configuration.privateKeyCifrada);

  const events = meetings.map((meeting) => {
    const event = meeting.eventosProveedor[0];
    if (!event?.externalEventId || !event.cuentaProveedor?.emailOrganizador) {
      throw new Error(`El encuentro ${meeting.id} no tiene conexión completa con Calendar.`);
    }
    return { meeting, event, calendarId: event.cuentaProveedor.emailOrganizador };
  });
  const plan = events.map(({ meeting, event, calendarId }) => ({
    instanciaId: meeting.id,
    solicitudId: meeting.solicitud.id,
    inicio: meeting.inicioProgramadoAt,
    calendarId,
    externalEventId: event.externalEventId,
    actuales: [
      ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
      ...meeting.cohostEmails.map(({ email }) => email)
    ]
  }));
  console.log(JSON.stringify({
    mode: applyChanges ? "apply" : "dry-run",
    serie: { solicitudId, titulo: request.titulo, encuentros: meetings.length },
    cohostsDeseados: desiredEmails,
    cohostsQuitados: removedEmails,
    plan
  }, null, 2));
  if (!applyChanges) return;

  const updatedPayloads = new Map<string, Prisma.InputJsonValue>();
  for (const { event, calendarId } of events) {
    const auth = new JWT({
      email: configuration.serviceAccountEmail,
      key: privateKey,
      scopes: [CALENDAR_SCOPE],
      subject: calendarId
    });
    const url = calendarEventUrl(calendarId, event.externalEventId!);
    const current = await auth.request<CalendarEvent>({ url, method: "GET" });
    const attendees = mergeAttendees(current.data.attendees ?? [], desiredEmails, removedEmails);
    const updated = sameAttendees(current.data.attendees ?? [], attendees)
      ? current
      : await auth.request<CalendarEvent>({
          url: `${url}?sendUpdates=all`,
          method: "PATCH",
          data: { attendees }
        });
    const resultingEmails = new Set((updated.data.attendees ?? []).map(({ email }) => normalizeEmail(email)));
    if (desiredEmails.some((email) => !resultingEmails.has(email))) {
      throw new Error(`Calendar no confirmó todos los invitados en ${event.externalEventId}.`);
    }
    if (removedEmails.some((email) => resultingEmails.has(email))) {
      throw new Error(`Calendar no quitó todos los invitados en ${event.externalEventId}.`);
    }
    updatedPayloads.set(event.id, JSON.parse(JSON.stringify(updated.data)) as Prisma.InputJsonValue);
  }

  await db.$transaction(async (tx) => {
    for (const { meeting, event } of events) {
      await tx.cohostEmailReunion.deleteMany({
        where: { instanciaSalaId: meeting.id, email: { in: [...desiredEmails, ...removedEmails] } }
      });
      await tx.cohostReunion.deleteMany({
        where: {
          instanciaSalaId: meeting.id,
          cuentaGoogle: { email: { in: removedEmails } }
        }
      });
      for (const email of desiredEmails) {
        const cuentaGoogleId = linkedByEmail.get(email);
        if (cuentaGoogleId) {
          await tx.cohostReunion.upsert({
            where: { instanciaSalaId_cuentaGoogleId: { instanciaSalaId: meeting.id, cuentaGoogleId } },
            create: { instanciaSalaId: meeting.id, cuentaGoogleId },
            update: {}
          });
        } else {
          await tx.cohostEmailReunion.create({ data: { instanciaSalaId: meeting.id, email } });
        }
      }
      await tx.eventoProveedor.update({
        where: { id: event.id },
        data: { payloadUltimo: updatedPayloads.get(event.id), sincronizadoAt: new Date() }
      });
    }
    await tx.auditoria.create({
      data: {
        accion: "COHOSTS_SERIE_ACTUALIZADOS",
        entidadTipo: "SolicitudSala",
        entidadId: request.id,
        valorAnterior: { encuentros: plan.map(({ instanciaId, actuales }) => ({ instanciaId, actuales })) },
        valorNuevo: { cohosts: desiredEmails, quitados: removedEmails, encuentros: meetings.length }
      }
    });
  }, { timeout: 30_000 });
}

type CalendarAttendee = Readonly<{
  email: string;
  optional?: boolean;
  comment?: string;
  displayName?: string;
}>;

type CalendarEvent = Readonly<{
  attendees?: readonly CalendarAttendee[];
  [key: string]: unknown;
}>;

function mergeAttendees(
  current: readonly CalendarAttendee[],
  desired: readonly string[],
  removed: readonly string[]
): CalendarAttendee[] {
  const removedSet = new Set(removed);
  const result = new Map<string, CalendarAttendee>();
  for (const attendee of current) {
    const email = normalizeEmail(attendee.email);
    if (!removedSet.has(email)) {
      result.set(email, {
        email,
        ...(attendee.optional === undefined ? {} : { optional: attendee.optional }),
        ...(attendee.comment ? { comment: attendee.comment } : {}),
        ...(attendee.displayName ? { displayName: attendee.displayName } : {})
      });
    }
  }
  for (const email of desired) result.set(email, { email });
  return [...result.values()];
}

function sameAttendees(left: readonly CalendarAttendee[], right: readonly CalendarAttendee[]): boolean {
  const emails = (attendees: readonly CalendarAttendee[]) =>
    attendees.map(({ email }) => normalizeEmail(email)).sort().join(",");
  return emails(left) === emails(right);
}

function calendarEventUrl(calendarId: string, eventId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`;
}

function argumentValue(name: string): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1]?.trim() : "";
  if (!value) throw new Error(`Falta ${name}.`);
  return value;
}

function argumentValues(name: string): string[] {
  return process.argv.flatMap((value, index) => value === name && process.argv[index + 1]
    ? [process.argv[index + 1]]
    : []);
}

function normalizeEmail(value: string): string {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error(`Correo inválido: ${value}`);
  return email;
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => db.$disconnect());
