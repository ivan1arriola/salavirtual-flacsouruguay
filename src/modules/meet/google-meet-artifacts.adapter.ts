import { JWT } from "google-auth-library";
import { crearHtmlAsistencia, type FilaAsistenciaMeet } from "./meet-artifacts.domain";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const MEET_API = "https://meet.googleapis.com/v2";
const MEET_BETA_API = "https://meet.googleapis.com/v2beta";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

export type MeetArtifactCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export type ConferenceRecord = Readonly<{
  name: string;
  startTime: string;
  endTime?: string;
}>;

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
      const response = await auth.request<{ conferenceRecords?: ConferenceRecord[] }>({
        url: `${MEET_API}/conferenceRecords?filter=${encodeURIComponent(filter)}&pageSize=100`,
        method: "GET"
      });
      return elegirConferencia(response.data.conferenceRecords ?? [], inicio);
    },

    async obtenerArtefactos(conferenceName: string): Promise<Readonly<{
      recordings: readonly GoogleArtifact[];
      transcripts: readonly GoogleArtifact[];
      notes: readonly GoogleArtifact[];
    }>> {
      const [recordings, transcripts, notes] = await Promise.all([
        listarPaginas<Recording>(auth, `${MEET_API}/${conferenceName}/recordings`, "recordings"),
        listarPaginas<Transcript>(auth, `${MEET_API}/${conferenceName}/transcripts`, "transcripts"),
        listarPaginas<SmartNote>(auth, `${MEET_BETA_API}/${conferenceName}/smartNotes`, "smartNotes")
          .catch(() => [] as SmartNote[])
      ]);
      return {
        recordings: recordings.flatMap((item) =>
          item.state === "FILE_GENERATED" && item.driveDestination?.file
            ? [{ resourceName: item.name, driveFileId: item.driveDestination.file, startTime: item.startTime, extension: "mp4" }]
            : []),
        transcripts: transcripts.flatMap((item) =>
          item.state === "FILE_GENERATED" && item.docsDestination?.document
            ? [{ resourceName: item.name, driveFileId: item.docsDestination.document, startTime: item.startTime }]
            : []),
        notes: notes.flatMap((item) =>
          item.state === "FILE_GENERATED" && item.docsDestination?.document
            ? [{ resourceName: item.name, driveFileId: item.docsDestination.document, startTime: item.startTime }]
            : [])
      };
    },

    async obtenerDocumentoAsistencia(conferenceName: string) {
      const participants = await listarPaginas<Participant>(
        auth,
        `${MEET_API}/${conferenceName}/participants?pageSize=250`,
        "participants"
      );
      const rows = await Promise.all(participants.map(async (participant) => {
        const sessions = await listarPaginas<ParticipantSession>(
          auth,
          `${MEET_API}/${participant.name}/participantSessions?pageSize=250`,
          "participantSessions"
        );
        return sessions.flatMap((session): FilaAsistenciaMeet[] => session.endTime ? [{
          nombre: nombreParticipante(participant),
          tipo: tipoParticipante(participant),
          inicio: session.startTime,
          fin: session.endTime
        }] : []);
      }));
      return crearHtmlAsistencia(rows.flat());
    },

    async obtenerOCrearCarpeta(parentId: string, name: string) {
      const escaped = name.replaceAll("'", "\\'");
      const query = `mimeType = '${FOLDER_MIME}' and name = '${escaped}' and '${parentId}' in parents and trashed = false`;
      const listed = await auth.request<{ files?: { id: string }[] }>({
        url: `${DRIVE_API}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&includeItemsFromAllDrives=true&supportsAllDrives=true`,
        method: "GET"
      });
      if (listed.data.files?.[0]?.id) return listed.data.files[0].id;
      const created = await auth.request<{ id?: string }>({
        url: `${DRIVE_API}/files?fields=id&supportsAllDrives=true`,
        method: "POST",
        data: { name, mimeType: FOLDER_MIME, parents: [parentId] }
      });
      if (!created.data.id) throw new Error("Drive no devolvió el ID de la carpeta creada.");
      return created.data.id;
    },

    async moverArchivo(fileId: string, folderId: string, name: string): Promise<MovedDriveFile> {
      const current = await auth.request<MovedDriveFile & Readonly<{ parents?: string[] }>>({
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
      const moved = await auth.request<MovedDriveFile>({
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
      const response = await auth.request<MovedDriveFile>({
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
type Participant = Readonly<{ name: string; signedinUser?: { displayName?: string }; anonymousUser?: { displayName?: string }; phoneUser?: { displayName?: string } }>;
type ParticipantSession = Readonly<{ startTime: string; endTime?: string }>;

async function listarPaginas<T>(auth: JWT, baseUrl: string, field: string): Promise<T[]> {
  const values: T[] = [];
  let pageToken: string | undefined;
  do {
    const separator = baseUrl.includes("?") ? "&" : "?";
    const response = await auth.request<Record<string, unknown>>({
      url: `${baseUrl}${pageToken ? `${separator}pageToken=${encodeURIComponent(pageToken)}` : ""}`,
      method: "GET"
    });
    values.push(...((response.data[field] as T[] | undefined) ?? []));
    pageToken = response.data.nextPageToken as string | undefined;
  } while (pageToken);
  return values;
}

function elegirConferencia(records: readonly ConferenceRecord[], inicio: Date): ConferenceRecord | null {
  return records.reduce<ConferenceRecord | null>((selected, current) => {
    if (!selected) return current;
    const currentDistance = Math.abs(new Date(current.startTime).getTime() - inicio.getTime());
    const selectedDistance = Math.abs(new Date(selected.startTime).getTime() - inicio.getTime());
    return currentDistance < selectedDistance ? current : selected;
  }, null);
}

function nombreParticipante(participant: Participant): string {
  return participant.signedinUser?.displayName ?? participant.anonymousUser?.displayName ?? participant.phoneUser?.displayName ?? "Sin nombre";
}

function tipoParticipante(participant: Participant): FilaAsistenciaMeet["tipo"] {
  return participant.signedinUser ? "CUENTA_GOOGLE" : participant.phoneUser ? "TELEFONO" : "ANONIMO";
}
