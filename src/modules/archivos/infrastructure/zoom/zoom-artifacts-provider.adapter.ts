import { createHash } from "node:crypto";
import {
  crearGoogleDriveAuthClient,
  subirArchivoBinarioDrive,
  type GoogleAuthCredentials,
} from "@/src/integrations/google";
import {
  crearZoomClient,
  esRecursoZoomInexistente,
  listarInstanciasPasadasZoom,
  listarParticipantesEnVivoZoom,
  listarParticipantesReporteZoom,
  obtenerGrabacionesZoom,
  obtenerMetricasReunionEnVivoZoom,
  obtenerReunionPasadaZoom,
  obtenerReunionZoom,
  type ZoomClient,
  type ZoomCredentials,
} from "@/src/integrations/zoom";
import {
  artefactosDesdeGrabacionesZoom,
  claveParticipanteZoom,
  crearHtmlAsistencia,
  elegirInstanciaZoom,
  participantesDesdeSesionesZoom,
  sesionesDesdeReporteZoom,
  type GoogleArtifact,
  type MeetActiveParticipantsScan,
  type MeetAttendanceDocument,
  type MovedDriveFile,
  type RegistroConferenciaMeet,
} from "../../domain";
import type { ArtifactProviderPort } from "../../ports";

export type ZoomArtifactsDependencies = Readonly<{
  /** Credenciales Zoom; null si la integración no está configurada. */
  obtenerCredencialesZoom: () => Promise<ZoomCredentials | null>;
  /** Adaptador Google ya autenticado: Drive y Sheets siguen siendo el destino. */
  google: ArtifactProviderPort;
  /** Identidad Google para subir archivos binarios a Drive. */
  googleDrive: GoogleAuthCredentials;
  ahora?: () => Date;
}>;

/**
 * Artefactos de reuniones Zoom: la conferencia, la asistencia y las grabaciones
 * salen de Zoom; carpetas, planillas y archivos se escriben en el mismo Drive
 * institucional que usa Meet. Así la planilla aplica la misma regla de 5/6.
 */
export function crearZoomArtifactsProviderAdapter(deps: ZoomArtifactsDependencies): ArtifactProviderPort {
  const ahora = deps.ahora ?? (() => new Date());
  let clientPromise: Promise<ZoomClient> | null = null;
  const client = () => {
    clientPromise ??= deps.obtenerCredencialesZoom().then((credentials) => {
      if (!credentials) throw new Error("Zoom no está configurado en Sala Virtual.");
      return crearZoomClient(credentials);
    });
    return clientPromise;
  };

  async function buscarConferencia(codigo: string, inicio: Date, fin: Date): Promise<RegistroConferenciaMeet | null> {
    const zoom = await client();
    try {
      const instancias = await listarInstanciasPasadasZoom(zoom, codigo);
      const elegida = elegirInstanciaZoom(instancias, inicio, fin);
      if (elegida) {
        const detalle = await obtenerReunionPasadaZoom(zoom, elegida.name).catch(() => null);
        return {
          name: elegida.name,
          startTime: detalle?.start_time ?? elegida.startTime,
          ...(detalle?.end_time ? { endTime: detalle.end_time } : {}),
        };
      }
    } catch (error) {
      if (!esRecursoZoomInexistente(error)) throw error;
    }

    // Reunión en curso: todavía no figura en past_meetings.
    const reunion = await obtenerReunionZoom(zoom, codigo).catch(() => null);
    if (reunion?.status === "started") {
      return { name: reunion.uuid ?? String(reunion.id), startTime: reunion.start_time ?? inicio.toISOString() };
    }
    return null;
  }

  async function obtenerConferencia(conferenceName: string): Promise<RegistroConferenciaMeet> {
    const detalle = await obtenerReunionPasadaZoom(await client(), conferenceName);
    return {
      name: detalle.uuid,
      startTime: detalle.start_time,
      ...(detalle.end_time ? { endTime: detalle.end_time } : {}),
    };
  }

  return {
    buscarConferencia,
    obtenerConferencia,

    async obtenerArtefactos(conferenceName) {
      const grabaciones = await obtenerGrabacionesZoom(await client(), conferenceName);
      return artefactosDesdeGrabacionesZoom(conferenceName, grabaciones?.recording_files ?? []);
    },

    async obtenerDocumentoAsistencia(conferenceName): Promise<MeetAttendanceDocument> {
      const zoom = await client();
      const [detalle, participantes] = await Promise.all([
        obtenerReunionPasadaZoom(zoom, conferenceName).catch(() => null),
        listarParticipantesReporteZoom(zoom, conferenceName),
      ]);
      const sesiones = sesionesDesdeReporteZoom(conferenceName, participantes);
      const personas = new Set(sesiones.map(({ participanteId }) => participanteId));
      return {
        html: crearHtmlAsistencia(sesiones.map((sesion) => ({
          ...sesion,
          tipo: sesion.correoVerificado ? "CUENTA_GOOGLE" as const : "ANONIMO" as const,
        }))),
        planilla: { sesionesMeet: sesiones, correosAuditados: [], eventosAuditoria: [] },
        // El reporte de Zoom está completo cuando la reunión terminó y ya lista participantes.
        completa: Boolean(detalle?.end_time) && sesiones.length > 0,
        participantes: personas.size,
        sesiones: sesiones.length,
      };
    },

    async obtenerParticipantesActivos(codigo, inicio, fin, conferenceRecord): Promise<MeetActiveParticipantsScan> {
      const record = conferenceRecord !== undefined ? conferenceRecord : await buscarConferencia(codigo, inicio, fin);
      if (!record) {
        return {
          conferenciaExiste: false,
          participantesActivos: [],
          participantesDesconectados: [],
          todosParticipantes: [],
          enGruposPequenos: false,
          cantidadGruposPequenos: 0,
        };
      }
      const zoom = await client();
      const enCurso = !record.endTime;
      if (enCurso) {
        // Dashboard API (Business+). Si no está disponible, la consola muestra
        // la conferencia sin participantes hasta que exista el reporte.
        const vivos = await listarParticipantesEnVivoZoom(zoom, codigo).catch(() => []);
        return participantesDesdeSesionesZoom(
          record.name,
          vivos.flatMap((p) => p.join_time ? [{
            clave: claveParticipanteZoom(p),
            nombre: p.user_name,
            email: p.email?.toLowerCase() || undefined,
            inicio: p.join_time,
            fin: p.leave_time || undefined,
          }] : []),
          ahora()
        );
      }
      const reporte = await listarParticipantesReporteZoom(zoom, record.name).catch(() => []);
      return participantesDesdeSesionesZoom(
        record.name,
        reporte.map((p) => ({
          clave: claveParticipanteZoom(p),
          nombre: p.name,
          email: p.user_email?.toLowerCase() || undefined,
          inicio: p.join_time,
          fin: p.leave_time,
        })),
        ahora()
      );
    },

    async transferirArtefacto(artifact: GoogleArtifact, folderId: string, name: string): Promise<MovedDriveFile> {
      if (!artifact.downloadUrl) {
        return deps.google.moverArchivo(artifact.driveFileId, folderId, name);
      }
      const descarga = await (await client()).descargar(artifact.downloadUrl);
      const mimeType = artifact.mimeType ?? "application/octet-stream";
      const operationId = createHash("sha256").update(`zoom|${artifact.resourceName}|${folderId}`).digest("hex");
      return subirArchivoBinarioDrive(crearGoogleDriveAuthClient(deps.googleDrive), {
        folderId,
        name: artifact.extension && !name.endsWith(`.${artifact.extension}`) ? `${name}.${artifact.extension}` : name,
        mimeType,
        operationId,
        contenido: descarga.body!,
        tamanoBytes: artifact.tamanoBytes ?? (Number(descarga.headers.get("content-length")) || undefined),
      });
    },

    obtenerOCrearCarpeta: (parentId, name) => deps.google.obtenerOCrearCarpeta(parentId, name),
    moverArchivo: (fileId, folderId, name) => deps.google.moverArchivo(fileId, folderId, name),
    subirDocumentoGoogle: (folderId, name, html) => deps.google.subirDocumentoGoogle(folderId, name, html),
    ...(deps.google.subirPlanillaAsistencia ? { subirPlanillaAsistencia: deps.google.subirPlanillaAsistencia.bind(deps.google) } : {}),
    ...(deps.google.planillaAsistenciaGoogleVacia ? { planillaAsistenciaGoogleVacia: deps.google.planillaAsistenciaGoogleVacia.bind(deps.google) } : {}),
  };
}

/** Estado de grabación en vivo para la consola (requiere Dashboard API). */
export async function zoomGrabandoEnVivo(credentials: ZoomCredentials, meetingId: string): Promise<boolean> {
  const metricas = await obtenerMetricasReunionEnVivoZoom(crearZoomClient(credentials), meetingId);
  return Boolean(metricas?.has_recording);
}
