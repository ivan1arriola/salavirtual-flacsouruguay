import { JWT } from "google-auth-library";
import { conReintentosPorLimiteGoogle } from "./google-api-retry.adapter";
import {
  asistenciaMeetCompleta,
  crearHtmlAsistencia,
  elegirConferenciaMeet,
  type FilaAsistenciaMeet,
  type RegistroConferenciaMeet
} from "./meet-artifacts.domain";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const MEET_API = "https://meet.googleapis.com/v2";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

export type MeetArtifactCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export type ConferenceRecord = RegistroConferenciaMeet;

export type GoogleArtifact = Readonly<{
  resourceName: string;
  driveFileId: string;
  startTime?: string;
  extension?: string;
}>;

export type MovedDriveFile = Readonly<{
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
}>;

export type EstadoGrabacionMeet = "AUSENTE" | "PROCESANDO" | "GENERADA";

export type MeetArtifactsScan = Readonly<{
  recordings: readonly GoogleArtifact[];
  transcripts: readonly GoogleArtifact[];
  notes: readonly GoogleArtifact[];
  estadoGrabacion: EstadoGrabacionMeet;
  pendientes: number;
}>;

export type MeetAttendanceDocument = Readonly<{
  html: string;
  completa: boolean;
  participantes: number;
  sesiones: number;
}>;

export type ParticipanteActivoMeet = Readonly<{
  nombre: string;
  email?: string;
  user?: string;
  tipo: "CUENTA_GOOGLE" | "ANONIMO" | "TELEFONO";
}>;

export type MeetActiveParticipantsScan = Readonly<{
  conferenciaExiste: boolean;
  conferenceName?: string;
  participantesActivos: readonly ParticipanteActivoMeet[];
}>;

export function crearGoogleMeetArtifactsClient(credentials: MeetArtifactCredentials) {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [DRIVE_SCOPE, MEET_SCOPE],
    subject: credentials.subject
  });

  return {
    async buscarConferencia(codigo: string, inicio: Date, fin: Date) {
      const margin = 12 * 60 * 60 * 1000;
      const filter = [
        `space.meeting_code = "${codigo}"`,
        `start_time >= "${new Date(inicio.getTime() - margin).toISOString()}"`,
        `start_time <= "${new Date(fin.getTime() + margin).toISOString()}"`
      ].join(" AND ");
      const records = await listarPaginas<ConferenceRecord>(
        auth,
        `${MEET_API}/conferenceRecords?filter=${encodeURIComponent(filter)}&pageSize=100`,
        "conferenceRecords"
      );
      return elegirConferenciaMeet(records, inicio, fin);
    },

    async obtenerParticipantesActivos(codigo: string, inicio: Date, fin: Date): Promise<MeetActiveParticipantsScan> {
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

    async obtenerConferencia(conferenceName: string): Promise<ConferenceRecord> {
      const response = await requestGoogle<ConferenceRecord>(auth, {
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
      const generatedRecordings = recordings.flatMap((item) =>
        item.state === "FILE_GENERATED" && item.driveDestination?.file
          ? [{ resourceName: item.name, driveFileId: item.driveDestination.file, startTime: item.startTime, extension: "mp4" }]
          : []);
      const generatedTranscripts = transcripts.flatMap((item) =>
        item.state === "FILE_GENERATED" && item.docsDestination?.document
          ? [{ resourceName: item.name, driveFileId: item.docsDestination.document, startTime: item.startTime }]
          : []);
      const generatedNotes = notes.flatMap((item) =>
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
        (sessionsByParticipant[index] ?? []).flatMap((session): FilaAsistenciaMeet[] => session.endTime ? [{
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

    async obtenerOCrearCarpeta(parentId: string, name: string) {
      const escaped = name.replaceAll("'", "\\'");
      const query = `mimeType = '${FOLDER_MIME}' and name = '${escaped}' and '${parentId}' in parents and trashed = false`;
      const listed = await requestGoogle<{ files?: { id: string }[] }>(auth, {
        url: `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&includeItemsFromAllDrives=true&supportsAllDrives=true`,
        method: "GET"
      });
      if (listed.data.files?.[0]?.id) return listed.data.files[0].id;
      const created = await requestGoogle<{ id?: string }> (auth, {
        url: `${DRIVE_API}/files?fields=id&supportsAllDrives=true`,
        method: "POST",
        data: { name, mimeType: FOLDER_MIME, parents: [parentId] }
      });
      if (!created.data.id) throw new Error("Drive no devolvió el ID de la carpeta creada.");
      return created.data.id;
    },

    async moverArchivo(fileId: string, folderId: string, name: string): Promise<MovedDriveFile> {
      const current = await requestGoogle<MovedDriveFile & Readonly<{ parents?: string[] }>>(auth, {
        url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,parents&supportsAllDrives=true`,
        method: "GET"
      });
      const removeParents = (current.data.parents ?? []).filter((id) => id !== folderId).join(",");
      const params = new URLSearchParams({
        addParents: folderId,
        fields: "id,name,mimeType,size,webViewLink",
        supportsAllDrives: "true"
      });
      if (removeParents) params.set("removeParents", removeParents);
      const moved = await requestGoogle<MovedDriveFile>(auth, {
        url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
        method: "PATCH",
        data: { name }
      });
      return moved.data;
    },

    async subirDocumentoGoogle(folderId: string, name: string, html: string): Promise<MovedDriveFile> {
      const boundary = "gestor_flacso_meet_boundary";
      const metadata = JSON.stringify({ name, mimeType: GOOGLE_DOC_MIME, parents: [folderId] });
      const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;
      const response = await requestGoogle<MovedDriveFile>(auth, {
        url: `${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`,
        method: "POST",
        headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
        data: body
      });
      return response.data;
    }
  } as const;
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
  return conReintentosPorLimiteGoogle(() => auth.request<T>(options));
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
  return participant.signedinUser?.displayName ?? participant.anonymousUser?.displayName ?? participant.phoneUser?.displayName ?? "Sin nombre";
}

function tipoParticipante(participant: Participant): FilaAsistenciaMeet["tipo"] {
  return participant.signedinUser ? "CUENTA_GOOGLE" : participant.phoneUser ? "TELEFONO" : "ANONIMO";
}
