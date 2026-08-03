import type { Prisma, PrismaClient } from "@prisma/client";
import { withRequiredCohostEmails } from "./cohosts.domain";
import type { GoogleCalendarCredentials } from "./google-calendar.adapter";
import type { MeetProvider } from "./provider";

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
      if (existing?.codigoReunion && existing.joinUrl) {
        const codigoReunion = existing.codigoReunion;
        const joinUrl = existing.joinUrl;
        await copiarEnlaceMeet(dependencies.db, grupo.eventos.map(({ id }) => id), {
          codigoReunion,
          joinUrl,
          payload: existing.payloadUltimo
        });
        return grupo.eventos.map((evento) => ({
          eventoProveedorId: evento.id,
          estado: "SINCRONIZADA",
          codigoReunion
        }));
      }

      const [eventoPrincipal, ...eventosHermanos] = grupo.eventos;
      const hostEmail = eventoPrincipal.cuentaProveedor?.emailOrganizador;
      if (!hostEmail) {
        const result = await registrarError(
          dependencies.db,
          eventoPrincipal.id,
          "La cuenta host no tiene email organizador.",
        );
        return [result, ...eventosHermanos.map((evento) => ({
          eventoProveedorId: evento.id,
          estado: "PENDIENTE_CONFIGURACION" as const,
          error: "La cuenta host no tiene email organizador."
        }))];
      }
      try {
        const provider = dependencies.crearProvider({
          serviceAccountEmail,
          privateKey,
          subject: hostEmail,
        });
        const result = await provider.provisionarEvento({
          titulo: eventoPrincipal.instancia.solicitud.titulo,
          descripcion: eventoPrincipal.instancia.solicitud.descripcion ?? undefined,
          inicio: eventoPrincipal.instancia.inicioProgramadoAt,
          fin: eventoPrincipal.instancia.finProgramadoAt,
          timezone: eventoPrincipal.instancia.timezone,
          calendarId: hostEmail,
          cohostEmails: cohostEmailsDeInstancia(eventoPrincipal.instancia),
          requiereAsistencia: eventoPrincipal.instancia.requiereAsistencia,
        });
        await dependencies.db.eventoProveedor.update({
          where: { id: eventoPrincipal.id },
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
        if (eventosHermanos.length > 0) {
          await copiarEnlaceMeet(dependencies.db, eventosHermanos.map(({ id }) => id), result);
        }
        return [
          {
            eventoProveedorId: eventoPrincipal.id,
            estado: "SINCRONIZADA" as const,
            codigoReunion: result.codigoReunion,
          },
          ...eventosHermanos.map((evento) => ({
            eventoProveedorId: evento.id,
            estado: "SINCRONIZADA" as const,
            codigoReunion: result.codigoReunion,
          }))
        ];
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido de Google.";
        return [await registrarError(dependencies.db, eventoPrincipal.id, message)];
      }
    },
  ).then((results) => results.flat());
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

async function copiarEnlaceMeet(
  db: PrismaClient,
  eventoProveedorIds: readonly string[],
  result: Readonly<{ codigoReunion: string; joinUrl: string; payload?: unknown }>
): Promise<void> {
  if (eventoProveedorIds.length === 0) return;
  await db.eventoProveedor.updateMany({
    where: { id: { in: [...eventoProveedorIds] } },
    data: {
      externalEventId: null,
      codigoReunion: result.codigoReunion,
      joinUrl: result.joinUrl,
      payloadUltimo: result.payload === undefined ? undefined : JSON.parse(JSON.stringify(result.payload)),
      sincronizadoAt: new Date(),
      estadoIntegracion: "SINCRONIZADA",
      errorIntegracion: null
    }
  });
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
