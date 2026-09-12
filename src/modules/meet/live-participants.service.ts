import type { PrismaClient } from "@prisma/client";
import type {
  MeetActiveParticipantsScan,
  MeetArtifactCredentials,
  ParticipanteActivoMeet
} from "./google-meet-artifacts.adapter";

type LiveParticipantsClient = Readonly<{
  obtenerParticipantesActivos: (
    codigo: string,
    inicio: Date,
    fin: Date
  ) => Promise<MeetActiveParticipantsScan>;
}>;

type LiveParticipantsDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearClient: (credentials: MeetArtifactCredentials) => LiveParticipantsClient;
}>;

export type LiveParticipantsResult =
  | Readonly<{
      estado: "OK";
      conferenciaExiste: boolean;
      conferenceName?: string;
      participantes: readonly ParticipanteActivoMeet[];
    }>
  | Readonly<{
      estado: "NO_DISPONIBLE";
      motivo: "SIN_MEET" | "SIN_ORGANIZADOR" | "SIN_CREDENCIALES";
      participantes: readonly [];
    }>;

export async function obtenerParticipantesActivosInstancia(
  deps: LiveParticipantsDependencies,
  instanciaId: string
): Promise<LiveParticipantsResult> {
  const evento = await deps.db.eventoProveedor.findFirst({
    where: {
      instanciaSalaId: instanciaId,
      proveedor: { tipo: "GOOGLE_MEET" }
    },
    select: {
      codigoReunion: true,
      cuentaProveedor: {
        select: { emailOrganizador: true }
      },
      instancia: {
        select: {
          inicioProgramadoAt: true,
          finProgramadoAt: true
        }
      }
    }
  });

  if (!evento?.codigoReunion) {
    return { estado: "NO_DISPONIBLE", motivo: "SIN_MEET", participantes: [] };
  }

  const subject = evento.cuentaProveedor?.emailOrganizador?.trim();
  if (!subject) {
    return { estado: "NO_DISPONIBLE", motivo: "SIN_ORGANIZADOR", participantes: [] };
  }

  const configuracion = await deps.db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal" },
    select: {
      activa: true,
      serviceAccountEmail: true,
      privateKeyCifrada: true
    }
  });

  if (
    !configuracion?.activa ||
    !configuracion.serviceAccountEmail ||
    !configuracion.privateKeyCifrada
  ) {
    return { estado: "NO_DISPONIBLE", motivo: "SIN_CREDENCIALES", participantes: [] };
  }

  const client = deps.crearClient({
    serviceAccountEmail: configuracion.serviceAccountEmail,
    privateKey: deps.descifrar(configuracion.privateKeyCifrada),
    subject
  });
  const scan = await client.obtenerParticipantesActivos(
    evento.codigoReunion,
    evento.instancia.inicioProgramadoAt,
    evento.instancia.finProgramadoAt
  );

  return {
    estado: "OK",
    conferenciaExiste: scan.conferenciaExiste,
    ...(scan.conferenceName ? { conferenceName: scan.conferenceName } : {}),
    participantes: scan.participantesActivos
  };
}
