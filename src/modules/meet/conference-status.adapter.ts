import type {
  ConferenceRecord,
  EstadoGrabacionMeet,
  MeetArtifactsScan
} from "./google-meet-artifacts.adapter";

export type MeetParticipantSessionRaw = Readonly<{
  sessionId: string;
  displayName: string | null;
  startTime: string;
  endTime?: string;
}>;

export type MeetParticipantSession = Readonly<{
  sessionId: string;
  displayName: string | null;
  joinedAt: Date;
  leftAt: Date | null;
  active: boolean;
}>;

export type RecordingStatus =
  | "NO_INICIADA"
  | "GRABANDO"
  | "PROCESANDO"
  | "DISPONIBLE"
  | "NO_DISPONIBLE";

export type MeetConferenceSnapshot = Readonly<{
  conferenceName: string;
  startedAt: Date;
  endedAt: Date | null;
  participants: readonly MeetParticipantSession[];
  recording: Readonly<{ status: RecordingStatus; url: string | null }>;
}>;

export type MeetConferenceSnapshotClient = Readonly<{
  buscarConferencia: (codigo: string, inicio: Date, fin: Date) => Promise<ConferenceRecord | null>;
  obtenerSesionesParticipantes: (conferenceName: string) => Promise<readonly MeetParticipantSessionRaw[]>;
  obtenerArtefactos: (conferenceName: string) => Promise<MeetArtifactsScan>;
}>;

export async function getMeetConferenceSnapshot(
  meetingCode: string,
  inicio: Date,
  fin: Date,
  client: MeetConferenceSnapshotClient
): Promise<MeetConferenceSnapshot | null> {
  const record = await client.buscarConferencia(meetingCode, inicio, fin);
  if (!record) return null;

  const [sessions, artifacts] = await Promise.all([
    client.obtenerSesionesParticipantes(record.name),
    client.obtenerArtefactos(record.name)
  ]);

  return {
    conferenceName: record.name,
    startedAt: new Date(record.startTime),
    endedAt: record.endTime ? new Date(record.endTime) : null,
    participants: sessions.map((session) => ({
      sessionId: session.sessionId,
      displayName: session.displayName,
      joinedAt: new Date(session.startTime),
      leftAt: session.endTime ? new Date(session.endTime) : null,
      active: !session.endTime
    })),
    recording: normalizarGrabacion(artifacts.estadoGrabacion, artifacts.recordings[0]?.driveFileId)
  };
}

function normalizarGrabacion(
  estado: EstadoGrabacionMeet,
  driveFileId: string | undefined
): Readonly<{ status: RecordingStatus; url: string | null }> {
  if (estado === "GENERADA" && driveFileId) {
    return {
      status: "DISPONIBLE",
      url: `https://drive.google.com/file/d/${encodeURIComponent(driveFileId)}/view`
    };
  }
  if (estado === "PROCESANDO") return { status: "PROCESANDO", url: null };
  return { status: "NO_INICIADA", url: null };
}
