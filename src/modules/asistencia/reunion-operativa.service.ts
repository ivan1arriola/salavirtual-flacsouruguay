import type { PrismaClient } from "@prisma/client";
import { derivarEstadoReunion, type EstadoReunionOperativa } from "./estado-reunion";
import type {
  MeetArtifactCredentials,
} from "../meet/google-meet-artifacts.adapter";
import type {
  MeetConferenceSnapshot,
  MeetConferenceSnapshotClient,
  RecordingStatus,
} from "../meet/conference-status.adapter";

export type ReunionOperativaDisponibilidad =
  | Readonly<{ estado: "OK" }>
  | Readonly<{
      estado: "NO_DISPONIBLE";
      motivo: "SIN_MEET" | "SIN_ORGANIZADOR" | "SIN_CREDENCIALES";
    }>;

export type ReunionOperativaDto = Readonly<{
  instanciaId: string;
  estado: EstadoReunionOperativa;
  disponibilidad: ReunionOperativaDisponibilidad;
  meetUrl: string | null;
  conferenceName: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  participantCount: number;
  activeParticipantCount: number;
  participants: MeetConferenceSnapshot["participants"];
  recording: Readonly<{ status: RecordingStatus; url: string | null }>;
}>;

type ReunionOperativaDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearClient: (credentials: MeetArtifactCredentials) => MeetConferenceSnapshotClient;
  obtenerSnapshot: (
    meetingCode: string,
    inicio: Date,
    fin: Date,
    client: MeetConferenceSnapshotClient,
  ) => Promise<MeetConferenceSnapshot | null>;
}>;

const GRABACION_VACIA = { status: "NO_INICIADA" as const, url: null };

export async function obtenerReunionOperativa(
  deps: ReunionOperativaDependencies,
  instanciaId: string,
  ahora = new Date(),
): Promise<ReunionOperativaDto> {
  const evento = await deps.db.eventoProveedor.findFirst({
    where: {
      instanciaSalaId: instanciaId,
      proveedor: { tipo: "GOOGLE_MEET" },
    },
    select: {
      codigoReunion: true,
      joinUrl: true,
      cuentaProveedor: { select: { emailOrganizador: true } },
      instancia: {
        select: {
          id: true,
          inicioProgramadoAt: true,
          finProgramadoAt: true,
        },
      },
    },
  });

  if (!evento?.codigoReunion) {
    return reunionSinSnapshot(
      instanciaId,
      ahora,
      evento?.instancia.inicioProgramadoAt ?? ahora,
      evento?.instancia.finProgramadoAt ?? ahora,
      evento?.joinUrl ?? null,
      { estado: "NO_DISPONIBLE", motivo: "SIN_MEET" },
    );
  }

  const inicio = evento.instancia.inicioProgramadoAt;
  const fin = evento.instancia.finProgramadoAt;
  const subject = evento.cuentaProveedor?.emailOrganizador?.trim();
  if (!subject) {
    return reunionSinSnapshot(instanciaId, ahora, inicio, fin, evento.joinUrl, {
      estado: "NO_DISPONIBLE",
      motivo: "SIN_ORGANIZADOR",
    });
  }

  const configuracion = await deps.db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal" },
    select: {
      activa: true,
      serviceAccountEmail: true,
      privateKeyCifrada: true,
    },
  });
  if (!configuracion?.activa || !configuracion.serviceAccountEmail || !configuracion.privateKeyCifrada) {
    return reunionSinSnapshot(instanciaId, ahora, inicio, fin, evento.joinUrl, {
      estado: "NO_DISPONIBLE",
      motivo: "SIN_CREDENCIALES",
    });
  }

  const client = deps.crearClient({
    serviceAccountEmail: configuracion.serviceAccountEmail,
    privateKey: deps.descifrar(configuracion.privateKeyCifrada),
    subject,
  });
  const snapshot = await deps.obtenerSnapshot(evento.codigoReunion, inicio, fin, client);
  const estado = derivarEstadoReunion({
    ahora,
    inicio,
    fin,
    conferenciaInicio: snapshot?.startedAt ?? null,
    conferenciaFin: snapshot?.endedAt ?? null,
  });

  return {
    instanciaId,
    estado,
    disponibilidad: { estado: "OK" },
    meetUrl: evento.joinUrl,
    conferenceName: snapshot?.conferenceName ?? null,
    startedAt: snapshot?.startedAt ?? null,
    endedAt: snapshot?.endedAt ?? null,
    participantCount: snapshot?.participants.length ?? 0,
    activeParticipantCount: snapshot?.participants.filter((participant) => participant.active).length ?? 0,
    participants: snapshot?.participants ?? [],
    recording: snapshot?.recording ?? GRABACION_VACIA,
  };
}

function reunionSinSnapshot(
  instanciaId: string,
  ahora: Date,
  inicio: Date,
  fin: Date,
  meetUrl: string | null,
  disponibilidad: ReunionOperativaDisponibilidad,
): ReunionOperativaDto {
  return {
    instanciaId,
    estado: derivarEstadoReunion({
      ahora,
      inicio,
      fin,
      conferenciaInicio: null,
      conferenciaFin: null,
    }),
    disponibilidad,
    meetUrl,
    conferenceName: null,
    startedAt: null,
    endedAt: null,
    participantCount: 0,
    activeParticipantCount: 0,
    participants: [],
    recording: GRABACION_VACIA,
  };
}
