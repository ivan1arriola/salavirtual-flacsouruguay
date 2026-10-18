import {
  extraerCohostEmailsDeInstancia,
  invalidarVerificacionCohosts,
  normalizeCohostEmails,
  registrarVerificacionCohosts
} from "@/src/modules/conferencias/api";

export type GoogleCredentials = Readonly<{
  serviceAccountEmail?: string;
  clientEmail?: string;
  privateKey: string;
  subject?: string;
}>;

export type SincronizarCohostsDeps = Readonly<{
  db: {
    instanciaSala: {
      findUnique: (args: any) => Promise<any>;
    };
    eventoProveedor: {
      update: (args: any) => Promise<any>;
      updateMany: (args: any) => Promise<any>;
    };
  };
  descifrar: (value: string) => string;
  cargarCredencialesEncuentro: (db: any, descifrar: (v: string) => string, emailOrganizador?: string | null) => Promise<any>;
  configurarEspacio: (
    credentials: any,
    codigoReunion: string,
    settings: Readonly<{ cohostEmails?: readonly string[] }>
  ) => Promise<void>;
}>;

export async function sincronizarCohostsDeInstanciaUseCase(
  dependencies: SincronizarCohostsDeps,
  instanciaSalaId: string
): Promise<void> {
  const meeting = await dependencies.db.instanciaSala.findUnique({
    where: { id: instanciaSalaId },
    select: {
      eventosProveedor: {
        where: { proveedor: { tipo: "GOOGLE_MEET" } },
        select: {
          id: true,
          payloadUltimo: true,
          codigoReunion: true,
          cuentaProveedor: { select: { emailOrganizador: true } }
        },
        take: 1
      },
      cohosts: {
        select: { cuentaGoogle: { select: { email: true } } }
      },
      cohostEmails: { select: { email: true } }
    }
  });

  const event = meeting?.eventosProveedor[0];
  if (!meeting || !event?.codigoReunion) return;

  const cohostEmails = extraerCohostEmailsDeInstancia(meeting);

  await dependencies.db.eventoProveedor.update({
    where: { id: event.id },
    data: { payloadUltimo: JSON.parse(JSON.stringify(invalidarVerificacionCohosts(event.payloadUltimo))) }
  });

  try {
    const credentials = await dependencies.cargarCredencialesEncuentro(
      dependencies.db,
      dependencies.descifrar,
      event.cuentaProveedor?.emailOrganizador
    );
    await dependencies.configurarEspacio(credentials, event.codigoReunion, { cohostEmails });
    await dependencies.db.eventoProveedor.update({
      where: { id: event.id },
      data: {
        payloadUltimo: JSON.parse(
          JSON.stringify(
            registrarVerificacionCohosts(
              event.payloadUltimo,
              event.codigoReunion,
              credentials.subject ?? "",
              cohostEmails,
              new Date().toISOString()
            )
          )
        )
      }
    });
  } catch (error) {
    await dependencies.db.eventoProveedor.updateMany({
      where: {
        id: event.id,
        reclamoIntegracionAt: null,
        OR: [{ operacionPendiente: null }, { operacionPendiente: "CONFIGURAR_MEET" }]
      },
      data: {
        estadoIntegracion: "ERROR",
        operacionPendiente: "CONFIGURAR_MEET",
        errorIntegracion:
          error instanceof Error ? error.message : "No se pudieron verificar los cohosts en Google Meet."
      }
    });
    throw error;
  }
}
