import type { JWT } from "google-auth-library";
import {
  crearGoogleMeetArtifactsAuthClient,
  conReintentosGoogleLectura,
  GOOGLE_HTTP_TIMEOUT_MS,
  GOOGLE_HTTP_READ_TIMEOUT_MS,
  moverArchivoDrive,
  obtenerOCrearCarpetaDrive,
  subirDocumentoGoogleDrive
} from "@/src/integrations/google";
import {
  asistenciaMeetCompleta,
  crearHtmlAsistencia,
  elegirConferenciaMeet,
  type EstadoGrabacionMeet,
  type FilaAsistenciaMeet,
  type GoogleArtifact,
  type MeetActiveParticipantsScan,
  type MeetArtifactsScan,
  type MeetAttendanceDocument,
  type MovedDriveFile,
  type ParticipanteActivoMeet,
  type RegistroConferenciaMeet
} from "../../domain";
import type { ArtifactProviderCredentials, ArtifactProviderPort } from "../../ports";

const MEET_API = "https://meet.googleapis.com/v2";

export function crearGoogleArtifactsProviderAdapter(
  credentials: ArtifactProviderCredentials
): ArtifactProviderPort {
  const auth = crearGoogleMeetArtifactsAuthClient(credentials);

  return {
    async buscarConferencia(
      codigo: string,
      inicio: Date,
      fin: Date
    ): Promise<RegistroConferenciaMeet | null> {
      const margin = 12 * 60 * 60 * 1000;
      const filter = [
        `space.meeting_code = "${codigo}"`,
        `start_time >= "${new Date(inicio.getTime() - margin).toISOString()}"`,
        `start_time <= "${new Date(fin.getTime() + margin).toISOString()}"`
      ].join(" AND ");

      const records = await listarPaginas<RegistroConferenciaMeet>(
        auth,
        `${MEET_API}/conferenceRecords?filter=${encodeURIComponent(filter)}&pageSize=100`,
        "conferenceRecords"
      );
      return elegirConferenciaMeet(records, inicio, fin);
    },

    async obtenerParticipantesActivos(
      codigo: string,
      inicio: Date,
      fin: Date
    ): Promise<MeetActiveParticipantsScan> {
      const record = await this.buscarConferencia(codigo, inicio, fin);
      if (!record) return { conferenciaExiste: false, participantesActivos: [] };

      const participants = await listarPaginas<Participant>(
        auth,
        `${MEET_API}/${record.name}/participants?pageSize=250`,
        "participants"
      );
      const sessionsByParticipant = await mapConLimite(participants, 8, (participant) =>
        listarPaginas<ParticipantSession>(
          auth,
          `${MEET_API}/${participant.name}/participantSessions?pageSize=250`,
          "participantSessions"
        )
      );
      const participantesActivos: ParticipanteActivoMeet[] = [];
      participants.forEach((participant, index) => {
        const sessions = sessionsByParticipant[index] ?? [];
        const hasActiveSession = sessions.some((session) => !session.endTime);
        if (hasActiveSession) {
          participantesActivos.push({
            nombre: nombreParticipante(participant),
            user: participant.signedinUser?.user,
            tipo: tipoParticipante(participant)
          });
        }
      });

      return {
        conferenciaExiste: true,
        conferenceName: record.name,
        participantesActivos
      };
    },

    async obtenerConferencia(conferenceName: string): Promise<RegistroConferenciaMeet> {
      const response = await requestGoogle<RegistroConferenciaMeet>(auth, {
        url: `${MEET_API}/${conferenceName}`,
        method: "GET"
      });
      return response.data;
    },

    async obtenerArtefactos(conferenceName: string): Promise<MeetArtifactsScan> {
      const [recordings, transcripts, notes] = await Promise.all([
        listarPaginas<Recording>(auth, `${MEET_API}/${conferenceName}/recordings?pageSize=100`, "recordings"),
        listarPaginas<Transcript>(auth, `${MEET_API}/${conferenceName}/transcripts?pageSize=100`, "transcripts"),
        listarPaginas<SmartNote>(auth, `${MEET_API}/${conferenceName}/smartNotes?pageSize=100`, "smartNotes")
          .catch(() => [] as SmartNote[])
      ]);
      const generatedRecordings = recordings.flatMap((item): readonly GoogleArtifact[] =>
        item.state === "FILE_GENERATED" && item.driveDestination?.file
          ? [{ resourceName: item.name, driveFileId: item.driveDestination.file, startTime: item.startTime, extension: "mp4" }]
          : []);
      const generatedTranscripts = transcripts.flatMap((item): readonly GoogleArtifact[] =>
        item.state === "FILE_GENERATED" && item.docsDestination?.document
          ? [{ resourceName: item.name, driveFileId: item.docsDestination.document, startTime: item.startTime }]
          : []);
      const generatedNotes = notes.flatMap((item): readonly GoogleArtifact[] =>
        item.state === "FILE_GENERATED" && item.docsDestination?.document
          ? [{ resourceName: item.name, driveFileId: item.docsDestination.document, startTime: item.startTime }]
          : []);
      const estadoGrabacion: EstadoGrabacionMeet = generatedRecordings.length > 0
        ? "GENERADA"
        : recordings.length > 0
          ? "PROCESANDO"
          : "AUSENTE";

      return {
        recordings: generatedRecordings,
        transcripts: generatedTranscripts,
        notes: generatedNotes,
        estadoGrabacion,
        pendientes:
          recordings.length - generatedRecordings.length +
          transcripts.length - generatedTranscripts.length +
          notes.length - generatedNotes.length
      };
    },

    async obtenerDocumentoAsistencia(conferenceName: string): Promise<MeetAttendanceDocument> {
      const participants = await listarPaginas<Participant>(
        auth,
        `${MEET_API}/${conferenceName}/participants?pageSize=250`,
        "participants"
      );
      const sessionsByParticipant = await mapConLimite(participants, 8, (participant) =>
        listarPaginas<ParticipantSession>(
          auth,
          `${MEET_API}/${participant.name}/participantSessions?pageSize=250`,
          "participantSessions"
        )
      );
      const rows = participants.flatMap((participant, index) =>
        (sessionsByParticipant[index] ?? []).flatMap((session): readonly FilaAsistenciaMeet[] => session.endTime ? [{
          nombre: nombreParticipante(participant),
          tipo: tipoParticipante(participant),
          inicio: session.startTime,
          fin: session.endTime
        }] : [])
      );
      return {
        html: crearHtmlAsistencia(rows),
        completa: asistenciaMeetCompleta(sessionsByParticipant),
        participantes: participants.length,
        sesiones: rows.length
      };
    },

    async obtenerOCrearCarpeta(parentId: string, name: string): Promise<string> {
      return obtenerOCrearCarpetaDrive(auth, parentId, name);
    },

    async moverArchivo(fileId: string, folderId: string, name: string): Promise<MovedDriveFile> {
      return moverArchivoDrive(auth, fileId, folderId, name);
    },

    async subirDocumentoGoogle(folderId: string, name: string, html: string): Promise<MovedDriveFile> {
      return subirDocumentoGoogleDrive(auth, folderId, name, html);
    }
  };
}

type Recording = Readonly<{ name: string; state: string; startTime?: string; driveDestination?: { file?: string } }>;
type Transcript = Readonly<{ name: string; state: string; startTime?: string; docsDestination?: { document?: string } }>;
type SmartNote = Transcript;
type Participant = Readonly<{ name: string; signedinUser?: { displayName?: string; user?: string }; anonymousUser?: { displayName?: string }; phoneUser?: { displayName?: string } }>;
type ParticipantSession = Readonly<{ startTime: string; endTime?: string }>;

type GoogleRequestOptions = Readonly<{
  url: string;
  method: "GET" | "POST" | "PATCH";
  data?: unknown;
  headers?: Readonly<Record<string, string>>;
}>;

async function requestGoogle<T>(auth: JWT, options: GoogleRequestOptions) {
  const send = () => auth.request<T>({ ...options, timeout: options.method === "GET"
    ? GOOGLE_HTTP_READ_TIMEOUT_MS : GOOGLE_HTTP_TIMEOUT_MS });
  // Writes are NOT retried: Google might have committed before returning a timeout.
  return options.method === "GET" ? conReintentosGoogleLectura(send) : send();
}

async function listarPaginas<T>(auth: JWT, baseUrl: string, field: string): Promise<T[]> {
  const values: T[] = [];
  let pageToken: string | undefined;
  do {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const response = await requestGoogle<Record<string, unknown>>(auth, {
      url: `${baseUrl}${pageToken ? `${separator}pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      method: "GET"
    });
    values.push(...((response.data[field] as T[] | undefined) ?? []));
    pageToken = response.data.nextPageToken as string | undefined;
  } while (pageToken);
  return values;
}

async function mapConLimite<T, R>(
  items: readonly T[],
  limite: number,
  operation: (item: T) => Promise<R>
): Promise<R[]> {
  if (items.length === 0) return [];
  const results = new Array<R>(items.length);
  let nextIndex = 0;
  const workers = Array.from({ length: Math.min(limite, items.length) }, async () => {
    while (nextIndex < items.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await operation(items[index]!);
    }
  });
  await Promise.all(workers);
  return results;
}

function nombreParticipante(participant: Participant): string {
  return (
    participant.signedinUser?.displayName ??
    participant.anonymousUser?.displayName ??
    participant.phoneUser?.displayName ??
    "Sin nombre"
  );
}

function tipoParticipante(participant: Participant): FilaAsistenciaMeet["tipo"] {
  return participant.signedinUser ? "CUENTA_GOOGLE" : participant.phoneUser ? "TELEFONO" : "ANONIMO";
}

