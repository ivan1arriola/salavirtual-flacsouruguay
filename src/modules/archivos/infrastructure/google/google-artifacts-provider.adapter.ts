import type { JWT } from "google-auth-library";
import { agruparCorreosAuditoriaMeet, filtrarEventosAuditoriaConferencia, obtenerEventosAuditoriaMeet, type EventoAuditoriaMeet } from "./google-meet-audit-emails.client";
import { buscarPlanillaAsistenciaDrive, crearPlanillaAsistenciaGoogle } from "./google-meet-attendance-sheets.client";
import { asegurarLecturaPorEnlacePlanilla } from "./google-meet-attendance-sharing.client";
import { createHash } from "node:crypto";
import { db } from "@/src/lib/db";
import {
  claveOperacionGoogle,
  ejecutarGooglePostUnaVez,
  confirmarOperacionDriveMarcada,
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
  buscarRecursoDrivePorOperacion,
  DRIVE_FOLDER_MIME,
  DRIVE_GOOGLE_DOC_MIME,
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
      if (!record) {
        return {
          conferenciaExiste: false,
          participantesActivos: [],
          participantesDesconectados: [],
          todosParticipantes: [],
          enGruposPequenos: false,
          cantidadGruposPequenos: 0
        };
      }

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
      const participantesDesconectados: ParticipanteActivoMeet[] = [];
      const todosParticipantes: ParticipanteActivoMeet[] = [];
      const nowMs = Date.now();
      let breakoutCount = 0;

      participants.forEach((participant, index) => {
        const sessions = sessionsByParticipant[index] ?? [];
        if (sessions.length === 0) return;

        const sortedSessions = [...sessions].sort(
          (a, b) => Date.parse(a.startTime) - Date.parse(b.startTime)
        );
        const activeSessions = sortedSessions.filter((session) => !session.endTime);
        const hasActiveSession = activeSessions.length > 0;
        const primeraEntradaAt = sortedSessions[0]?.startTime;
        const completedEndTimes = sortedSessions
          .map((session) => session.endTime)
          .filter((endTime): endTime is string => Boolean(endTime));
        const ultimaSalidaAt =
          !hasActiveSession && completedEndTimes.length > 0
            ? completedEndTimes[completedEndTimes.length - 1]
            : undefined;

        const totalMs = sortedSessions.reduce((acc, session) => {
          const startMs = Date.parse(session.startTime);
          const endMs = session.endTime ? Date.parse(session.endTime) : nowMs;
          if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
            return acc;
          }
          return acc + (endMs - startMs);
        }, 0);
        const minutosConectado = totalMs > 0 ? Math.max(1, Math.round(totalMs / 60_000)) : 0;
        const enGrupoPequeno = activeSessions.length > 1;
        if (enGrupoPequeno) breakoutCount += 1;

        const entry: ParticipanteActivoMeet = {
          nombre: nombreParticipante(participant),
          user: participant.signedinUser?.user,
          participanteId: participant.name,
          tipo: tipoParticipante(participant),
          conectado: hasActiveSession,
          primeraEntradaAt,
          ultimaSalidaAt,
          minutosConectado,
          numeroConexiones: sortedSessions.length,
          enGrupoPequeno,
          salaGrupoPequeno: enGrupoPequeno ? "Sala de grupo pequeño" : undefined
        };

        todosParticipantes.push(entry);
        if (hasActiveSession) {
          participantesActivos.push(entry);
        } else {
          participantesDesconectados.push(entry);
        }
      });

      return {
        conferenciaExiste: true,
        conferenceName: record.name,
        participantesActivos,
        participantesDesconectados,
        todosParticipantes,
        enGruposPequenos: breakoutCount > 0,
        cantidadGruposPequenos: breakoutCount
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
      const grabandoEnVivo = recordings.some((item) => item.state === "STARTED");
      const transcribiendoEnVivo = transcripts.some((item) => item.state === "STARTED");
      const estadoGrabacion: EstadoGrabacionMeet = generatedRecordings.length > 0
        ? "GENERADA"
        : recordings.length > 0
          ? "PROCESANDO"
          : "AUSENTE";
      const estadoTranscripcion = transcribiendoEnVivo
        ? "TRANSCRIBIENDO"
        : generatedTranscripts.length > 0
          ? "GENERADA"
          : transcripts.length > 0
            ? "PROCESANDO"
            : "AUSENTE";

      return {
        recordings: generatedRecordings,
        transcripts: generatedTranscripts,
        notes: generatedNotes,
        estadoGrabacion,
        grabandoEnVivo,
        transcribiendoEnVivo,
        estadoTranscripcion,
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
          fin: session.endTime,
          conferencia: conferenceName,
          participanteId: participant.name,
          sesionId: session.name
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
          const diaInicio = fechaLocalISO(new Date(Math.min(...rows.map(row => Date.parse(row.inicio)))));
          const diaFin = fechaLocalISO(new Date(Math.max(...rows.map(row => Date.parse(row.fin)))));
          const inicioDia = new Date(`${diaInicio}T00:00:00-03:00`);
          const finDia = new Date(`${diaFin}T00:00:00-03:00`);
          finDia.setUTCDate(finDia.getUTCDate() + 1);
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
          // Reports and Meet expose independent conference IDs. If multiple audit IDs overlap
          // this Meet record, preserve raw records but do not attribute emails to attendance.
          const clasificacion = filtrarEventosAuditoriaConferencia(eventos, actual.startTime, actual.endTime ?? new Date(conferenceEnd).toISOString());
          eventosAuditoria = clasificacion.eventosSolapados;
          correosAuditados = agruparCorreosAuditoriaMeet(clasificacion.eventosAtribuibles);
          const escapeHtml = (s: string) => s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
          const tableRows = correosAuditados.map(e => `<tr><td>${escapeHtml(e.correo)}</td><td>${e.externo === null ? "No informado" : e.externo ? "Sí" : "No"}</td><td>${escapeHtml(e.conferenciaId)}</td></tr>`).join("");
          emailAppendix = `<h2>Correos identificados (auditoría Workspace)</h2><p>Datos independientes de las sesiones: no se asignan correos por coincidencia de nombres. Pueden faltar correos o existir instancias próximas del mismo enlace.</p><table><thead><tr><th>Correo</th><th>Externo</th><th>Conferencia de auditoría</th></tr></thead><tbody>${tableRows}</tbody></table>`;
        } catch (error) {
          console.error("Meet attendance audit request failed; retrying.");
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
      const operationMarker = createHash("sha256").update(`${credentials.serviceAccountEmail}|${folderId}|${name}`).digest("hex");
      const input = { folderId, titulo: name, inicio, fin, organizador, cohosts, operationMarker,
        sesionesMeet: data.sesionesMeet, correosAuditados: data.correosAuditados, eventosAuditoria: data.eventosAuditoria
      };
      // El acceso por enlace se configura únicamente en la planilla, nunca
      // en la carpeta de la reunión (que también puede contener grabaciones).
      const compartir = async <T extends { id: string }>(sheet: T): Promise<T> => {
        await asegurarLecturaPorEnlacePlanilla(sheetsAuth, sheet.id);
        return sheet;
      };
      if (spreadsheetId) return compartir(await crearPlanillaAsistenciaGoogle(sheetsAuth, input, spreadsheetId));
      const existente = await buscarPlanillaAsistenciaDrive(sheetsAuth, operationMarker);
      if (existente) return compartir(await crearPlanillaAsistenciaGoogle(sheetsAuth, input, existente.id));
      const clave = claveOperacionGoogle("SHEETS_CREAR_ASISTENCIA", credentials.serviceAccountEmail, folderId, name);
      try {
        const result = await ejecutarGooglePostUnaVez(
          db,
          { clave, proveedor: "DRIVE", tipo: "SHEETS_CREAR_ASISTENCIA", cuenta: credentials.serviceAccountEmail, referencia: folderId },
          () => crearPlanillaAsistenciaGoogle(sheetsAuth, input),
          sheet => ({ id: sheet.id, name: sheet.name, mimeType: sheet.mimeType, webViewLink: sheet.webViewLink }),
          saved => ({ id: saved.id, name: saved.name, mimeType: saved.mimeType, webViewLink: saved.webViewLink })
        );
        return compartir(result);
      } catch (error) {
        if (!(error instanceof GoogleOperacionInciertaError)) throw error;
        const recovered = await buscarPlanillaAsistenciaDrive(sheetsAuth, operationMarker).catch(() => null);
        if (!recovered) throw error;
        // Un archivo recuperado tampoco se publica como accesible sin validar
        // el permiso del dominio institucional.
        await asegurarLecturaPorEnlacePlanilla(sheetsAuth, recovered.id);
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
          () => obtenerOCrearCarpetaDrive(auth, parentId, name, clave.slice(4)),
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
        const match = await buscarRecursoDrivePorOperacion(
          auth, parentId, name, DRIVE_FOLDER_MIME, clave.slice(4)
        ).catch(() => null);
        if (!match) throw error;
        const verifiedId = match.id;
        const confirmed = await confirmarOperacionDriveMarcada(db, clave, { id: verifiedId });
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
      try {
        return await ejecutarGooglePostUnaVez(
          db,
          { clave, proveedor: "DRIVE", tipo: "DRIVE_SUBIR_DOCUMENTO", cuenta: credentials.serviceAccountEmail, referencia: folderId },
          () => subirDocumentoGoogleDrive(auth, folderId, name, html, clave.slice(4)),
          (result) => {
            if (!result.id) throw new Error("La respuesta de Drive no incluyó ID.");
            return { id: result.id, name: result.name, mimeType: result.mimeType ?? "", webViewLink: result.webViewLink ?? "" };
          },
          (saved) => {
            if (!saved.id) throw new Error("La operación de documento Drive no contiene ID.");
            return { id: saved.id, name: saved.name, mimeType: saved.mimeType, webViewLink: saved.webViewLink };
          }
        );
      } catch (error) {
        if (!(error instanceof GoogleOperacionInciertaError)) throw error;
        const match = await buscarRecursoDrivePorOperacion(
          auth, folderId, name, DRIVE_GOOGLE_DOC_MIME, clave.slice(4)
        ).catch(() => null);
        if (!match) throw error;
        const result = { id: match.id, name: match.name, mimeType: match.mimeType ?? "", webViewLink: match.webViewLink ?? "" };
        const confirmed = await confirmarOperacionDriveMarcada(db, clave, result);
        if (confirmed) return result;
        const latest = await db.googleOperacionExterna.findUnique({
          where: { clave }, select: { estado: true, resultado: true }
        });
        if (latest?.estado === "CONFIRMADA" && latest.resultado &&
            typeof latest.resultado === "object" && !Array.isArray(latest.resultado) &&
            latest.resultado.id === match.id) return result;
        throw error;
      }
    }
  };
}

type Recording = Readonly<{ name: string; state: string; startTime?: string; driveDestination?: { file?: string } }>;
type Transcript = Readonly<{ name: string; state: string; startTime?: string; docsDestination?: { document?: string } }>;
type SmartNote = Transcript;
type Participant = Readonly<{ name: string; signedinUser?: { displayName?: string; user?: string }; anonymousUser?: { displayName?: string }; phoneUser?: { displayName?: string } }>;
type ParticipantSession = Readonly<{ name: string; startTime: string; endTime?: string }>;

function fechaLocalISO(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(date);
  const value = (type: "year" | "month" | "day") => parts.find(part => part.type === type)?.value ?? "00";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

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


