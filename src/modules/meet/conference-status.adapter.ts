import { JWT } from "google-auth-library";
import { conReintentosPorLimiteGoogle } from "./google-api-retry.adapter";
import {
  crearGoogleMeetArtifactsClient,
  type ConferenceRecord,
  type EstadoGrabacionMeet,
  type MeetArtifactCredentials,
  type MeetArtifactsScan
} from "./google-meet-artifacts.adapter";

const MEET_API = "https://meet.googleapis.com/v2";
const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";

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

type Participant = Readonly<{
  name: string;
  signedinUser?: { displayName?: string };
  anonymousUser?: { displayName?: string };
  phoneUser?: { displayName?: string };
}>;

type ParticipantSessionApi = Readonly<{
  name?: string;
  startTime: string;
  endTime?: string;
}>;

export function crearGoogleMeetConferenceSnapshotClient(
  credentials: MeetArtifactCredentials
): MeetConferenceSnapshotClient {
  const artifactsClient = crearGoogleMeetArtifactsClient(credentials);
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [MEET_SCOPE],
    subject: credentials.subject
  });

  return {
    buscarConferencia: (codigo, inicio, fin) => artifactsClient.buscarConferencia(codigo, inicio, fin),
    obtenerArtefactos: (conferenceName) => artifactsClient.obtenerArtefactos(conferenceName),
    async obtenerSesionesParticipantes(conferenceName) {
      const participants = await listarPaginas<Participant>(
        auth,
        `${MEET_API}/${conferenceName}/participants?pageSize=250`,
        "participants"
      );
      const sessionsByParticipant = await Promise.all(participants.map(async (participant) => ({
        participant,
        sessions: await listarPaginas<ParticipantSessionApi>(
          auth,
          `${MEET_API}/${participant.name}/participantSessions?pageSize=250`,
          "participantSessions"
        )
      })));

      return sessionsByParticipant.flatMap(({ participant, sessions }) =>
        sessions.map((session, index) => ({
          sessionId: session.name ?? `${participant.name}/participantSessions/${index}`,
          displayName: nombreParticipante(participant),
          startTime: session.startTime,
          ...(session.endTime ? { endTime: session.endTime } : {})
        }))
      );
    }
  };
}

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

function nombreParticipante(participant: Participant): string | null {
  return participant.signedinUser?.displayName
    ?? participant.anonymousUser?.displayName
    ?? participant.phoneUser?.displayName
    ?? null;
}

async function listarPaginas<T>(auth: JWT, baseUrl: string, field: string): Promise<T[]> {
  const values: T[] = [];
  let pageToken: string | undefined;
  do {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const response = await conReintentosPorLimiteGoogle(() => auth.request<Record<string, unknown>>({
      url: `${baseUrl}${pageToken ? `${separator}pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      method: "GET"
    }));
    values.push(...((response.data[field] as T[] | undefined) ?? []));
    pageToken = response.data.nextPageToken as string | undefined;
  } while (pageToken);
  return values;
}
