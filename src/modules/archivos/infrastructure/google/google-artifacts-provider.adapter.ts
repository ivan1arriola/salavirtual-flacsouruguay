import type { JWT } from "google-auth-library";
import { agruparCorreosAuditoriaMeet, obtenerEventosAuditoriaMeet, type EventoAuditoriaMeet } from "./google-meet-audit-emails.client";
import { buscarPlanillaAsistenciaDrive, crearPlanillaAsistenciaGoogle } from "./google-meet-attendance-sheets.client";
import { createHash } from "node:crypto";
import { db } from "@/src/lib/db";
import {
  claveOperacionGoogle,
  ejecutarGooglePostUnaVez,
  confirmarGoogleOperacionVerificada,
  GoogleOperacionInciertaError
} from "@/src/modules/operaciones/google-operaciones-externas.service";
import {
  crearGoogleMeetArtifactsAuthClient,
  crearGoogleAuthJwt,
  conReintentosGoogleLectura,
  GOOGLE_HTTP_TIMEOUT_MS,
  GOOGLE_HTTP_READ_TIMEOUT_MS,
  moverArchivoDrive,
  obtenerOCrearCarpetaDrive,
  buscarCarpetaDrive,
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

    async obtenerDocumentoAsistencia(conferenceName: string, meetingCode?: string): Promise<MeetAttendanceDocument> {
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
      let emailAppendix = "";
      let correosAuditados: ReturnType<typeof agruparCorreosAuditoriaMeet> = [];
      let eventosAuditoria: readonly EventoAuditoriaMeet[] = [];
      const adminEmail = process.env.GOOGLE_REPORTS_ADMIN_EMAIL?.trim();
      if (!adminEmail) throw new Error("Falta GOOGLE_REPORTS_ADMIN_EMAIL para planillas de asistencia con correos");
      if (meetingCode && rows.length > 0) {
        try {
          // Reports API se consulta por día completo de Uruguay, como el Apps Script validado.
          // La instancia de Meet se conserva por separado para evitar suposiciones sobre identidades.
          const localDay = new Intl.DateTimeFormat("en-CA", {
            timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit"
          }).format(new Date(rows[0]!.inicio));
          const inicioDia = new Date(localDay + "T00:00:00-03:00");
          const finDia = new Date(inicioDia.getTime() + 24 * 60 * 60 * 1000);
          const eventos = await obtenerEventosAuditoriaMeet({
            serviceAccountEmail: credentials.serviceAccountEmail,
            privateKey: credentials.privateKey, adminEmail, meetingCode,
            startTime: inicioDia.toISOString(),
            endTime: finDia.toISOString()
          });
          const actual = await this.obtenerConferencia(conferenceName);
          const conferenceStart = Date.parse(actual.startTime);
          const conferenceEnd = actual.endTime ? Date.parse(actual.endTime) : Date.parse(actual.startTime) + 4 * 60 * 60 * 1000;
          // Un mismo link de Meet puede tener varias conferencias en el mismo día.
          // Filtrar las conexiones de auditoría por el intervalo real de esta conferencia.
          eventosAuditoria = eventos.filter((event) => {
            const salida = Date.parse(event.timestamp);
            const entrada = salida - event.durationSeconds * 1000;
            return Number.isFinite(entrada) && Number.isFinite(salida) && Number.isFinite(conferenceStart) && Number.isFinite(conferenceEnd)
              && salida > conferenceStart && entrada < conferenceEnd;
          });
          correosAuditados = agruparCorreosAuditoriaMeet(eventosAuditoria);
          const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
          const tableRows = correosAuditados.map(e => `<tr><td>${escapeHtml(e.correo)}</td><td>${e.externo === null ? "No informado" : e.externo ? "Sí" : "No"}</td><td>${escapeHtml(e.conferenciaId)}</td></tr>`).join("");
          emailAppendix = `<h2>Correos identificados (auditoría Workspace)</h2><p>Datos independientes de las sesiones: no se asignan correos por coincidencia de nombres. Pueden faltar correos o existir instancias próximas del mismo enlace.</p><table><thead><tr><th>Correo</th><th>Externo</th><th>Conferencia de auditoría</th></tr></thead><tbody>${tableRows}</tbody></table>`;
        } catch (error) {
          console.error("Auditoría Meet no disponible:", error instanceof Error ? error.message : String(error));
          throw error; // No registrar un informe sin correos tras fallar la auditoría; el job debe reintentarse.
        }
      }
      const baseHtml = crearHtmlAsistencia(rows);
      return {
        html: emailAppendix ? baseHtml.replace("</body>", `${emailAppendix}</body>`) : baseHtml,
        planilla: { sesionesMeet: rows, correosAuditados, eventosAuditoria },
        completa: asistenciaMeetCompleta(sessionsByParticipant),
        participantes: participants.length,
        sesiones: rows.length
      };
    },

    async subirPlanillaAsistencia(folderId, name, data, inicio, fin, organizador, cohosts = [], spreadsheetId) {
      const sheetsAuth = crearGoogleAuthJwt(credentials, [
        "https://www.googleapis.com/auth/spreadsheets",
        "https://www.googleapis.com/auth/drive"
      ]);
      if (spreadsheetId) return crearPlanillaAsistenciaGoogle(sheetsAuth, {
        folderId, titulo: name, inicio, fin, organizador, cohosts,
        sesionesMeet: data.sesionesMeet, correosAuditados: data.correosAuditados, eventosAuditoria: data.eventosAuditoria
      }, spreadsheetId);
      const input = { folderId, titulo: name, inicio, fin, organizador, cohosts,
        sesionesMeet: data.sesionesMeet, correosAuditados: data.correosAuditados, eventosAuditoria: data.eventosAuditoria };
      const existente = await buscarPlanillaAsistenciaDrive(sheetsAuth, folderId, name);
      if (existente) return crearPlanillaAsistenciaGoogle(sheetsAuth, input, existente.id);
      const clave = claveOperacionGoogle("SHEETS_CREAR_ASISTENCIA", credentials.serviceAccountEmail, folderId, name);
      try { return await ejecutarGooglePostUnaVez(
        db,
        { clave, proveedor: "DRIVE", tipo: "SHEETS_CREAR_ASISTENCIA", cuenta: credentials.serviceAccountEmail, referencia: folderId },
        () => crearPlanillaAsistenciaGoogle(sheetsAuth, input),
        result => ({ id: result.id, name: result.name, mimeType: result.mimeType, webViewLink: result.webViewLink }),
        saved => ({ id: saved.id, name: saved.name, mimeType: saved.mimeType, webViewLink: saved.webViewLink })
      ); } catch (error) {
        if (!(error instanceof GoogleOperacionInciertaError)) throw error;
        const recovered = await buscarPlanillaAsistenciaDrive(sheetsAuth, folderId, name).catch(() => null);
        if (!recovered) throw error;
        const confirmed = await confirmarGoogleOperacionVerificada(db, clave, recovered);
        if (confirmed) return recovered;
        throw error;
      }
    },

    async obtenerOCrearCarpeta(parentId: string, name: string): Promise<string> {
      const clave = claveOperacionGoogle("DRIVE_CREAR_CARPETA", credentials.serviceAccountEmail, parentId, name);
      try {
        return await ejecutarGooglePostUnaVez(
          db,
          { clave, proveedor: "DRIVE", tipo: "DRIVE_CREAR_CARPETA", cuenta: credentials.serviceAccountEmail, referencia: parentId },
          () => obtenerOCrearCarpetaDrive(auth, parentId, name),
          (id) => ({ id }),
          (saved) => {
            if (!saved.id) throw new Error("La operación de carpeta Drive no contiene ID.");
            return saved.id;
          }
        );
      } catch (error) {
        if (!(error instanceof GoogleOperacionInciertaError)) throw error;
        // Only a unique exact remote match is sufficient evidence to recover.
        // Failure or no match must NOT cause a second POST.
        const verifiedId = await buscarCarpetaDrive(auth, parentId, name, true)
          .catch(() => null);
        if (!verifiedId) throw error;
        const confirmed = await confirmarGoogleOperacionVerificada(db, clave, { id: verifiedId });
        if (confirmed) return verifiedId;
        // Another worker can resolve it concurrently. Never infer a result
        // from a stale ENVIANDO lease or a different remote ID.
        const latest = await db.googleOperacionExterna.findUnique({
          where: { clave }, select: { estado: true, resultado: true }
        });
        if (latest?.estado === "CONFIRMADA" &&
            latest.resultado && typeof latest.resultado === "object" &&
            !Array.isArray(latest.resultado) &&
            latest.resultado.id === verifiedId) return verifiedId;
        throw error;
      }
    },

    async moverArchivo(fileId: string, folderId: string, name: string): Promise<MovedDriveFile> {
      return moverArchivoDrive(auth, fileId, folderId, name);
    },

    async subirDocumentoGoogle(folderId: string, name: string, html: string): Promise<MovedDriveFile> {
      // Include content hash so a deliberately modified report can be published
      // as a distinct version, but never replay a single ambiguous upload.
      const digest = createHash("sha256").update(html).digest("hex");
      const clave = claveOperacionGoogle(
        "DRIVE_SUBIR_DOCUMENTO", credentials.serviceAccountEmail, folderId, name, digest
      );
      return ejecutarGooglePostUnaVez(
        db,
        { clave, proveedor: "DRIVE", tipo: "DRIVE_SUBIR_DOCUMENTO", cuenta: credentials.serviceAccountEmail, referencia: folderId },
        () => subirDocumentoGoogleDrive(auth, folderId, name, html),
        (result) => {
          if (!result.id) throw new Error("La respuesta de Drive no incluyó ID.");
          return { id: result.id, name: result.name, mimeType: result.mimeType ?? "", webViewLink: result.webViewLink ?? "" };
        },
        (saved) => {
          if (!saved.id) throw new Error("La operación de documento Drive no contiene ID.");
          return { id: saved.id, name: saved.name, mimeType: saved.mimeType, webViewLink: saved.webViewLink };
        }
      );
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


