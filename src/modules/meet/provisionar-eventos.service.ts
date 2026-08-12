import type { Prisma, PrismaClient } from "@prisma/client";
import { withRequiredCohostEmails } from "./cohosts.domain";
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

  const groupedEvents = agruparPorSolicitud(eventos);
  return procesarEnLotes(
    groupedEvents,
    5,
    async (grupo): Promise<readonly ProvisionResult[]> => {
      const existing = await dependencies.db.eventoProveedor.findFirst({
        where: {
          proveedor: { tipo: "GOOGLE_MEET" },
          instancia: { solicitudSalaId: grupo.solicitudId },
          estadoIntegracion: "SINCRONIZADA",
          codigoReunion: { not: null },
          joinUrl: { not: null }
        },
        orderBy: { updatedAt: "asc" }
      });
      let conferenceData = extraerConferenceData(existing?.payloadUltimo);
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
          const result = await provider.provisionarEvento({
            titulo: evento.instancia.solicitud.titulo,
            descripcion: evento.instancia.descripcion ?? evento.instancia.solicitud.descripcion ?? undefined,
            inicio: evento.instancia.inicioProgramadoAt,
            fin: evento.instancia.finProgramadoAt,
            timezone: evento.instancia.timezone,
            calendarId: hostEmail,
            conferenceData,
            cohostEmails: cohostEmailsDeInstancia(evento.instancia),
            requiereAsistenciaTecnica: evento.instancia.requiereAsistenciaTecnica,
          });
          conferenceData ??= extraerConferenceData(result.payload);
          await dependencies.db.eventoProveedor.update({
            where: { id: evento.id },
            data: {
              externalEventId: result.externalEventId,
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

function agruparPorSolicitud(
  eventos: readonly EventoMeetProvisionable[]
): readonly Readonly<{ solicitudId: string; eventos: readonly EventoMeetProvisionable[] }>[] {
  const grupos = new Map<string, EventoMeetProvisionable[]>();
  for (const evento of eventos) {
    const solicitudId = evento.instancia.solicitud.id;
    grupos.set(solicitudId, [...(grupos.get(solicitudId) ?? []), evento]);
  }
  return [...grupos.entries()].map(([solicitudId, eventos]) => ({
    solicitudId,
    eventos: [...eventos].sort(
      (left, right) =>
        left.instancia.inicioProgramadoAt.getTime() - right.instancia.inicioProgramadoAt.getTime()
    )
  }));
}

function cohostEmailsDeInstancia(
  instancia: EventoMeetProvisionable["instancia"]
): readonly string[] {
  return withRequiredCohostEmails([
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
