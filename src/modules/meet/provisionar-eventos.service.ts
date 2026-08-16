import type { Prisma, PrismaClient } from "@prisma/client";
import { createHash } from "node:crypto";
import { normalizeCohostEmails } from "./cohosts.domain";
import { extraerConferenceData } from "./google-calendar.domain";
import type { GoogleCalendarCredentials } from "./google-calendar.adapter";
import type { MeetProvider } from "./provider";
import { recalcularSolicitud } from "../reuniones/encuentros-persistence.adapter";

export type ProvisionDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearProvider: (credentials: GoogleCalendarCredentials) => MeetProvider;
}>;

export type ProvisionResult = Readonly<{
  eventoProveedorId: string;
  estado: "SINCRONIZADA" | "ERROR" | "PENDIENTE_CONFIGURACION";
  codigoReunion?: string;
  error?: string;
}>;

export async function provisionarEventosMeet(
  dependencies: ProvisionDependencies,
  eventoProveedorIds: readonly string[],
): Promise<readonly ProvisionResult[]> {
  const results = await provisionarEventosMeetInterno(dependencies, eventoProveedorIds);
  await recalcularSolicitudesDeEventos(dependencies.db, eventoProveedorIds);
  return results;
}

async function provisionarEventosMeetInterno(
  dependencies: ProvisionDependencies,
  eventoProveedorIds: readonly string[],
): Promise<readonly ProvisionResult[]> {
  const configuracion =
    await dependencies.db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal", activa: true },
    });
  if (
    !configuracion?.serviceAccountEmail ||
    !configuracion.privateKeyCifrada
  ) {
    return eventoProveedorIds.map((eventoProveedorId) => ({
      eventoProveedorId,
      estado: "PENDIENTE_CONFIGURACION",
    }));
  }
  const serviceAccountEmail = configuracion.serviceAccountEmail;

  const eventos = await dependencies.db.eventoProveedor.findMany({
    where: {
      id: { in: [...eventoProveedorIds] },
      proveedor: { tipo: "GOOGLE_MEET" },
    },
    include: {
      cuentaProveedor: true,
      instancia: {
        include: {
          solicitud: true,
          cohosts: { include: { cuentaGoogle: { select: { email: true } } } },
          cohostEmails: { select: { email: true } }
        }
      },
    },
  });
  const privateKey = await descifrarORegistrarError(
    dependencies,
    eventoProveedorIds,
    configuracion.privateKeyCifrada,
  );
  if (typeof privateKey !== "string") return privateKey;

  const groupedEvents = agruparPorSerie(eventos);
  return procesarEnLotes(
    groupedEvents,
    5,
    async (grupo): Promise<readonly ProvisionResult[]> => {
      const existing = await dependencies.db.eventoProveedor.findMany({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          instancia: {
            solicitudSalaId: grupo.solicitudSalaId
          },
          estadoIntegracion: "SINCRONIZADA",
          codigoReunion: { not: null },
          joinUrl: { not: null }
        },
        orderBy: { updatedAt: "asc" },
        select: { payloadUltimo: true }
      });
      let conferenceData = existing
        .map(({ payloadUltimo }) => extraerConferenceData(payloadUltimo))
        .find((value) => value !== undefined);
      if (existing.length > 0 && !conferenceData) {
        return Promise.all(grupo.eventos.map(({ id }) => registrarError(
          dependencies.db,
          id,
          "La serie ya tiene un enlace Meet, pero sus datos de conferencia no se pueden reutilizar."
        )));
      }
      const results: ProvisionResult[] = [];
      for (const evento of grupo.eventos) {
        const hostEmail = evento.cuentaProveedor?.emailOrganizador;
        if (!hostEmail) {
          results.push(await registrarError(
            dependencies.db,
            evento.id,
            "La cuenta host no tiene email organizador.",
          ));
          continue;
        }
        try {
          const provider = dependencies.crearProvider({
            serviceAccountEmail,
            privateKey,
            subject: hostEmail,
          });
          const request = {
            titulo: evento.instancia.solicitud.titulo,
            descripcion: evento.instancia.descripcion ?? evento.instancia.solicitud.descripcion ?? undefined,
            inicio: evento.instancia.inicioProgramadoAt,
            fin: evento.instancia.finProgramadoAt,
            timezone: evento.instancia.timezone,
            calendarId: hostEmail,
            conferenceData,
            cohostEmails: cohostEmailsDeInstancia(evento.instancia),
            requiereAsistenciaTecnica: evento.instancia.requiereAsistenciaTecnica,
            // Google accepts lowercase base32hex ids. This is deterministic for
            // the EventoProveedor, so a lost POST response cannot create a
            // different Calendar event on retry.
            calendarEventId: calendarEventId(evento.id)
          } as const;
          let externalEventId = evento.externalEventId;
          if (!externalEventId) {
            const created = await provider.crearEventoCalendar(request);
            externalEventId = created.externalEventId;
            // This write is deliberately before polling/configuring Meet.
            await dependencies.db.eventoProveedor.update({
              where: { id: evento.id },
              data: {
                externalEventId,
                payloadUltimo: JSON.parse(JSON.stringify(created.payload)),
                estadoIntegracion: "PENDIENTE",
                errorIntegracion: null
              }
            });
          }
          let result = await provider.obtenerEvento(hostEmail, externalEventId);
          for (const delay of [250, 500, 1000, 2000]) {
            if (result) break;
            await esperar(delay);
            result = await provider.obtenerEvento(hostEmail, externalEventId);
          }
          if (!result) throw new Error("Google Calendar todavía no terminó de generar el enlace Meet.");
          await provider.configurarEventoMeet(request, result);
          conferenceData ??= extraerConferenceData(result.payload);
          await dependencies.db.eventoProveedor.update({
            where: { id: evento.id },
            data: {
              externalEventId,
              codigoReunion: result.codigoReunion,
              joinUrl: result.joinUrl,
              payloadUltimo: JSON.parse(JSON.stringify(result.payload)),
              sincronizadoAt: new Date(),
              estadoIntegracion: "SINCRONIZADA",
              errorIntegracion: result.warning ?? null,
            },
          });
          results.push({
            eventoProveedorId: evento.id,
            estado: "SINCRONIZADA",
            codigoReunion: result.codigoReunion,
          });
        } catch (error) {
          const message = error instanceof Error ? error.message : "Error desconocido de Google.";
          results.push(await registrarError(dependencies.db, evento.id, message));
        }
      }
      return results;
    },
  ).then((results) => results.flat());
}

async function recalcularSolicitudesDeEventos(
  db: PrismaClient,
  eventoProveedorIds: readonly string[]
): Promise<void> {
  const events = await db.eventoProveedor.findMany({
    where: { id: { in: [...eventoProveedorIds] } },
    select: { instancia: { select: { solicitudSalaId: true } } }
  });
  const solicitudIds = [...new Set(events.map(({ instancia }) => instancia.solicitudSalaId))];
  for (const solicitudId of solicitudIds) {
    await db.$transaction((tx) => recalcularSolicitud(tx, solicitudId));
  }
}

type EventoMeetProvisionable = Prisma.EventoProveedorGetPayload<{
  include: {
    cuentaProveedor: true;
    instancia: {
      include: {
        solicitud: true;
        cohosts: { include: { cuentaGoogle: { select: { email: true } } } };
        cohostEmails: { select: { email: true } };
      };
    };
  };
}>;

function agruparPorSerie(
  eventos: readonly EventoMeetProvisionable[]
): readonly Readonly<{
  solicitudSalaId: string;
  eventos: readonly EventoMeetProvisionable[];
}>[] {
  const grupos = new Map<string, EventoMeetProvisionable[]>();
  for (const evento of eventos) {
    const key = evento.instancia.solicitudSalaId;
    grupos.set(key, [...(grupos.get(key) ?? []), evento]);
  }
  return [...grupos.values()].map((eventos) => ({
    solicitudSalaId: eventos[0].instancia.solicitudSalaId,
    eventos: [...eventos].sort(
      (left, right) =>
        left.instancia.inicioProgramadoAt.getTime() - right.instancia.inicioProgramadoAt.getTime()
    )
  }));
}

function calendarEventId(eventoProveedorId: string): string {
  return `a${createHash("sha256").update(eventoProveedorId).digest("hex")}`;
}

function esperar(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

function cohostEmailsDeInstancia(
  instancia: EventoMeetProvisionable["instancia"]
): readonly string[] {
  return normalizeCohostEmails([
    ...instancia.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
    ...instancia.cohostEmails.map(({ email }) => email)
  ]);
}

async function procesarEnLotes<T, R>(
  values: readonly T[],
  size: number,
  process: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const batches = values.reduce<readonly (readonly T[])[]>(
    (result, value, index) =>
      index % size === 0
        ? [...result, [value]]
        : [
            ...result.slice(0, -1),
            [...(result[result.length - 1] ?? []), value],
          ],
    [],
  );
  return batches.reduce<Promise<readonly R[]>>(
    async (previous, batch) => [
      ...(await previous),
      ...(await Promise.all(batch.map(process))),
    ],
    Promise.resolve([]),
  );
}

async function descifrarORegistrarError(
  dependencies: ProvisionDependencies,
  eventoProveedorIds: readonly string[],
  privateKeyCifrada: string,
): Promise<string | readonly ProvisionResult[]> {
  try {
    return dependencies.descifrar(privateKeyCifrada);
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "No se pudo leer la clave de Google.";
    return Promise.all(
      eventoProveedorIds.map((id) =>
        registrarError(dependencies.db, id, message),
      ),
    );
  }
}

async function registrarError(
  db: PrismaClient,
  eventoProveedorId: string,
  error: string,
): Promise<ProvisionResult> {
  await db.eventoProveedor.update({
    where: { id: eventoProveedorId },
    data: { estadoIntegracion: "ERROR", errorIntegracion: error },
  });
  return { eventoProveedorId, estado: "ERROR", error };
}
