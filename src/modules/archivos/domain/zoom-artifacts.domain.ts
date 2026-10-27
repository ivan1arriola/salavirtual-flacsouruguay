import type {
  GoogleArtifact,
  MeetActiveParticipantsScan,
  MeetArtifactsScan,
  ParticipanteActivoMeet,
} from "./archivos.types";
import { elegirConferenciaMeet, type RegistroConferenciaMeet } from "./meet-artifacts.domain";
import { resumirIntervalosAsistencia } from "./meet-attendance-summary.domain";

/**
 * Traducciones puras de las respuestas de Zoom a los tipos que ya usan la
 * sincronización de archivos, la planilla de asistencia y la consola.
 * Las estructuras se declaran acá (sin importar el cliente HTTP) para que el
 * dominio no dependa de infraestructura.
 */

export type ZoomInstanciaPasada = Readonly<{ uuid: string; start_time: string; end_time?: string }>;

export type ZoomParticipanteReporte = Readonly<{
  id?: string;
  user_id?: string;
  participant_user_id?: string;
  name: string;
  user_email?: string;
  join_time: string;
  leave_time: string;
  duration?: number;
}>;

export type ZoomParticipanteEnVivo = Readonly<{
  id?: string;
  user_id?: string;
  participant_user_id?: string;
  user_name: string;
  email?: string;
  join_time?: string;
  leave_time?: string;
}>;

export type ZoomArchivoGrabacion = Readonly<{
  id: string;
  recording_start?: string;
  file_type: string;
  file_extension?: string;
  file_size?: number;
  download_url: string;
  status?: string;
  recording_type?: string;
}>;

/** Sesión con la forma que consume la planilla (MeetSheetSession). */
export type SesionAsistenciaZoom = Readonly<{
  nombre: string;
  tipo: string;
  inicio: string;
  fin: string;
  conferencia: string;
  participanteId?: string;
  sesionId: string;
  correoVerificado?: string;
}>;

function correo(value: string | undefined): string | undefined {
  const normalized = value?.trim().toLowerCase();
  return normalized && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) ? normalized : undefined;
}

/**
 * Identidad estable de un participante entre reconexiones. Zoom repite
 * participant_user_id para usuarios autenticados; para invitados anónimos solo
 * queda el nombre visible, que no se usa para unir personas distintas con
 * correo diferente.
 */
export function claveParticipanteZoom(p: Readonly<{
  participant_user_id?: string;
  user_email?: string;
  email?: string;
  id?: string;
  name?: string;
  user_name?: string;
}>): string {
  const email = correo(p.user_email ?? p.email);
  if (email) return `email:${email}`;
  if (p.participant_user_id) return `zoom:${p.participant_user_id}`;
  if (p.id) return `zoom:${p.id}`;
  return `nombre:${(p.name ?? p.user_name ?? "").trim().toLowerCase()}`;
}

/** Margen para aceptar una instancia iniciada antes del horario programado. */
const MARGEN_INICIO_ZOOM_MS = 2 * 60 * 60 * 1000;

/**
 * Elige la instancia (UUID) de la reunión Zoom que corresponde al encuentro.
 * El listado de instancias de Zoom solo trae start_time, así que no se puede
 * medir solapamiento: se acepta la instancia que empezó entre dos horas antes
 * del inicio y el fin programado, priorizando la más cercana al inicio.
 */
export function elegirInstanciaZoom(
  instancias: readonly ZoomInstanciaPasada[],
  inicio: Date,
  fin: Date
): RegistroConferenciaMeet | null {
  const conFin = instancias.filter(({ end_time }) => Boolean(end_time));
  if (conFin.length === instancias.length && instancias.length > 0) {
    return elegirConferenciaMeet(
      conFin.map(({ uuid, start_time, end_time }) => ({ name: uuid, startTime: start_time, endTime: end_time })),
      inicio,
      fin
    );
  }
  const desde = inicio.getTime() - MARGEN_INICIO_ZOOM_MS;
  const hasta = fin.getTime();
  const distancia = (instancia: ZoomInstanciaPasada) => Math.abs(Date.parse(instancia.start_time) - inicio.getTime());
  const elegida = instancias
    .filter(({ start_time }) => {
      const start = Date.parse(start_time);
      return Number.isFinite(start) && start >= desde && start <= hasta;
    })
    .reduce<ZoomInstanciaPasada | null>(
      (mejor, actual) => (!mejor || distancia(actual) < distancia(mejor) ? actual : mejor),
      null
    );
  return elegida
    ? { name: elegida.uuid, startTime: elegida.start_time, ...(elegida.end_time ? { endTime: elegida.end_time } : {}) }
    : null;
}

export function sesionesDesdeReporteZoom(
  uuid: string,
  participantes: readonly ZoomParticipanteReporte[]
): readonly SesionAsistenciaZoom[] {
  return participantes.flatMap((p, index) => {
    if (!Number.isFinite(Date.parse(p.join_time)) || !Number.isFinite(Date.parse(p.leave_time))) return [];
    const email = correo(p.user_email);
    return [{
      nombre: p.name?.trim() || email || "Participante sin nombre",
      tipo: email ? "CUENTA_ZOOM" : "INVITADO_ZOOM",
      inicio: new Date(Date.parse(p.join_time)).toISOString(),
      fin: new Date(Date.parse(p.leave_time)).toISOString(),
      conferencia: uuid,
      participanteId: claveParticipanteZoom(p),
      sesionId: `${claveParticipanteZoom(p)}|${p.join_time}|${index}`,
      ...(email ? { correoVerificado: email } : {}),
    }];
  });
}

/** Orden estable sin mutar el arreglo original. */
function ordenarPor<T>(items: readonly T[], clave: (item: T) => number): readonly T[] {
  return items.reduce<readonly T[]>((acc, item) => {
    const index = acc.findIndex((actual) => clave(actual) > clave(item));
    return index < 0 ? [...acc, item] : [...acc.slice(0, index), item, ...acc.slice(index)];
  }, []);
}

type SesionConsolaZoom = Readonly<{ clave: string; nombre: string; email?: string; inicio: string; fin?: string }>;

/** Resumen por persona para la consola (minutos fusionados, conexiones). */
export function participantesDesdeSesionesZoom(
  uuid: string,
  sesiones: readonly SesionConsolaZoom[],
  ahora: Date
): MeetActiveParticipantsScan {
  const grupos = sesiones.reduce<Readonly<Record<string, readonly SesionConsolaZoom[]>>>(
    (acc, sesion) => ({ ...acc, [sesion.clave]: [...(acc[sesion.clave] ?? []), sesion] }),
    {}
  );
  const ahoraIso = ahora.toISOString();

  const todos: readonly ParticipanteActivoMeet[] = Object.entries(grupos).map(([clave, grupo]) => {
    const ordenadas = ordenarPor(grupo, ({ inicio }) => Date.parse(inicio));
    const primeraSesion = ordenadas[0]!;
    const email = grupo.find((sesion) => sesion.email)?.email;
    const conectado = ordenadas.some(({ fin }) => !fin);
    const intervalos = ordenadas.map(({ inicio, fin }) => ({ inicio, fin: fin ?? ahoraIso }));
    const primera = Date.parse(primeraSesion.inicio);
    const ultima = Math.max(...intervalos.map(({ fin }) => Date.parse(fin)));
    const resumen = resumirIntervalosAsistencia(intervalos, new Date(primera), new Date(Math.max(ultima, primera + 1)));
    const finales = ordenarPor(ordenadas.flatMap(({ fin }) => (fin ? [fin] : [])), (fin) => Date.parse(fin));
    return {
      nombre: primeraSesion.nombre,
      ...(email ? { email, origenEmail: "REPORTS_API" as const } : {}),
      participanteId: `${uuid}/${clave}`,
      tipo: email ? "CUENTA_GOOGLE" as const : "ANONIMO" as const,
      conectado,
      primeraEntradaAt: primeraSesion.inicio,
      ...(!conectado && finales.length > 0 ? { ultimaSalidaAt: finales[finales.length - 1]! } : {}),
      minutosConectado: resumen.minutosConectados > 0 ? Math.max(1, resumen.minutosConectados) : 0,
      numeroConexiones: ordenadas.length,
      enGrupoPequeno: false,
    };
  });

  return {
    conferenciaExiste: true,
    conferenceName: uuid,
    participantesActivos: todos.filter(({ conectado }) => conectado),
    participantesDesconectados: todos.filter(({ conectado }) => !conectado),
    todosParticipantes: todos,
    enGruposPequenos: false,
    cantidadGruposPequenos: 0,
  };
}

/** Orden de preferencia del MP4 a conservar por segmento de grabación. */
const PREFERENCIA_VIDEO = [
  "shared_screen_with_speaker_view",
  "shared_screen_with_speaker_view(CC)",
  "active_speaker",
  "shared_screen_with_gallery_view",
  "gallery_view",
  "shared_screen",
];

function rangoVideo(tipo: string | undefined): number {
  const index = PREFERENCIA_VIDEO.indexOf(tipo ?? "");
  return index < 0 ? PREFERENCIA_VIDEO.length : index;
}

export function artefactosDesdeGrabacionesZoom(
  uuid: string,
  archivos: readonly ZoomArchivoGrabacion[]
): MeetArtifactsScan {
  const videos = archivos.filter((file) => file.file_type === "MP4");
  const procesando = archivos.filter((file) => file.status && file.status !== "completed");
  // Zoom genera varias vistas del mismo segmento; se conserva una por segmento.
  const porSegmento = videos
    .filter((file) => !file.status || file.status === "completed")
    .reduce<Readonly<Record<string, ZoomArchivoGrabacion>>>((acc, video) => {
      const segmento = video.recording_start ?? video.id;
      const actual = acc[segmento];
      return !actual || rangoVideo(video.recording_type) < rangoVideo(actual.recording_type)
        ? { ...acc, [segmento]: video }
        : acc;
    }, {});

  const artefacto = (file: ZoomArchivoGrabacion, extension: string, mimeType: string): GoogleArtifact => ({
    resourceName: `zoom/${uuid}/recording/${file.id}`,
    driveFileId: "",
    ...(file.recording_start ? { startTime: file.recording_start } : {}),
    extension,
    downloadUrl: file.download_url,
    mimeType,
    ...(typeof file.file_size === "number" ? { tamanoBytes: file.file_size } : {}),
  });

  const recordings = ordenarPor(Object.values(porSegmento), (file) => Date.parse(file.recording_start ?? "") || 0)
    .map((file) => artefacto(file, "mp4", "video/mp4"));
  const transcripts = archivos
    .filter((file) => file.file_type === "TRANSCRIPT" && (!file.status || file.status === "completed"))
    .map((file) => artefacto(file, "vtt", "text/vtt"));

  return {
    recordings,
    transcripts,
    notes: [],
    estadoGrabacion: recordings.length > 0
      ? "GENERADA"
      : videos.length > 0 || procesando.some((file) => file.file_type === "MP4")
        ? "PROCESANDO"
        : "AUSENTE",
    estadoTranscripcion: transcripts.length > 0
      ? "GENERADA"
      : procesando.some((file) => file.file_type === "TRANSCRIPT") ? "PROCESANDO" : "AUSENTE",
    pendientes: procesando.length,
  };
}
