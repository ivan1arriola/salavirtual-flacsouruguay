import type { PrismaClient } from "@prisma/client";
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
  if (!configuracion) {
    return eventoProveedorIds.map((eventoProveedorId) => ({
      eventoProveedorId,
      estado: "PENDIENTE_CONFIGURACION",
    }));
  }

  const eventos = await dependencies.db.eventoProveedor.findMany({
    where: {
      id: { in: [...eventoProveedorIds] },
      proveedor: { tipo: "GOOGLE_MEET" },
    },
    include: {
      cuentaProveedor: true,
      instancia: { include: { solicitud: true } },
    },
  });
  const privateKey = await descifrarORegistrarError(
    dependencies,
    eventoProveedorIds,
    configuracion.privateKeyCifrada,
  );
  if (typeof privateKey !== "string") return privateKey;

  return Promise.all(
    eventos.map(async (evento): Promise<ProvisionResult> => {
      const hostEmail = evento.cuentaProveedor?.emailOrganizador;
      if (!hostEmail) {
        return registrarError(
          dependencies.db,
          evento.id,
          "La cuenta host no tiene email organizador.",
        );
      }
      try {
        const provider = dependencies.crearProvider({
          serviceAccountEmail: configuracion.serviceAccountEmail,
          privateKey,
          subject: hostEmail,
        });
        const result = await provider.provisionarEvento({
          titulo: evento.instancia.solicitud.titulo,
          descripcion: evento.instancia.solicitud.descripcion ?? undefined,
          inicio: evento.instancia.inicioProgramadoAt,
          fin: evento.instancia.finProgramadoAt,
          timezone: evento.instancia.timezone,
          calendarId: hostEmail,
        });
        await dependencies.db.eventoProveedor.update({
          where: { id: evento.id },
          data: {
            externalEventId: result.externalEventId,
            codigoReunion: result.codigoReunion,
            joinUrl: result.joinUrl,
            payloadUltimo: JSON.parse(JSON.stringify(result.payload)),
            sincronizadoAt: new Date(),
            estadoIntegracion: "SINCRONIZADA",
            errorIntegracion: null,
          },
        });
        return {
          eventoProveedorId: evento.id,
          estado: "SINCRONIZADA",
          codigoReunion: result.codigoReunion,
        };
      } catch (error) {
        const message =
          error instanceof Error
            ? error.message
            : "Error desconocido de Google.";
        return registrarError(dependencies.db, evento.id, message);
      }
    }),
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
