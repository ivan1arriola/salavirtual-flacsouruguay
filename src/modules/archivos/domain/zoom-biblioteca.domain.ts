import { clasificarTipoArchivoZoom } from "./zoom-archivos.domain";
import { tipoArchivoReunionZoom } from "./zoom-inventario-estado.domain";

export type CategoriaArchivoZoom =
  "VIDEO" | "AUDIO" | "CHAT" | "TRANSCRIPCION" | "LINEA_DE_TIEMPO" | "RESUMEN" | "OTROS";
export type FiltroCategoriaZoom = "TODOS" | CategoriaArchivoZoom;

export type EstadoArchivoZoomVista =
  | "DESCUBIERTO"
  | "PROCESANDO_ORIGEN"
  | "PENDIENTE"
  | "COPIANDO"
  | "CONSERVADO"
  | "ERROR_REINTENTABLE"
  | "REQUIERE_REVISION";

/** Lo que la biblioteca sabe de un archivo del inventario: nunca incluye URLs de descarga de Zoom. */
export type ArchivoInventarioZoomVista = Readonly<{
  id: string;
  tipoOriginal: string;
  variante: string | null;
  extension: string | null;
  estado: EstadoArchivoZoomVista;
  tamanoBytes: bigint | null;
  descargable: boolean;
  webViewUrl: string | null;
  errorCodigo: string | null;
}>;

const ETIQUETAS: Readonly<Record<CategoriaArchivoZoom, string>> = {
  VIDEO: "Video",
  AUDIO: "Audio",
  CHAT: "Chat",
  TRANSCRIPCION: "Transcripción y subtítulos",
  LINEA_DE_TIEMPO: "Línea de tiempo",
  RESUMEN: "Resumen",
  OTROS: "Otros archivos"
};

export function etiquetaCategoriaZoom(categoria: CategoriaArchivoZoom): string {
  return ETIQUETAS[categoria];
}

/** Todo tipo, incluso uno desconocido, cae en una categoría: ningún archivo desaparece de «Todos». */
export function categoriaArchivoZoom(tipoOriginal: string): CategoriaArchivoZoom {
  switch (clasificarTipoArchivoZoom(tipoOriginal)) {
    case "MP4":
      return "VIDEO";
    case "M4A":
    case "MP3":
      return "AUDIO";
    case "CHAT":
      return "CHAT";
    case "TRANSCRIPT":
    case "CC":
    case "AUDIO_TRANSCRIPT":
      return "TRANSCRIPCION";
    case "TIMELINE":
      return "LINEA_DE_TIEMPO";
    case "SUMMARY":
      return "RESUMEN";
    default:
      return "OTROS";
  }
}

export function filtrarArchivosZoomPorCategoria<T extends Pick<ArchivoInventarioZoomVista, "tipoOriginal">>(
  archivos: readonly T[],
  filtro: FiltroCategoriaZoom
): readonly T[] {
  return filtro === "TODOS"
    ? archivos
    : archivos.filter((a) => categoriaArchivoZoom(a.tipoOriginal) === filtro);
}

export type ResumenArchivosZoom = Readonly<{
  descubiertos: number;
  conservados: number;
  /** Aún sin copiar y sin fallo que exija intervención (incluye en copia y con reintento). */
  pendientes: number;
  revision: number;
  conError: number;
  bytesConocidos: bigint;
  /** null cuando algún tamaño se desconoce: no se presenta una suma parcial como total. */
  bytesTotales: bigint | null;
  tamanosDesconocidos: number;
}>;

export function resumirArchivosZoom(archivos: readonly ArchivoInventarioZoomVista[]): ResumenArchivosZoom {
  const conservados = archivos.filter((a) => a.estado === "CONSERVADO").length;
  const revision = archivos.filter((a) => a.estado === "REQUIERE_REVISION").length;
  const conocidos = archivos.flatMap((a) => (a.tamanoBytes === null ? [] : [a.tamanoBytes]));
  const bytesConocidos = conocidos.reduce((suma, b) => suma + b, 0n);
  const tamanosDesconocidos = archivos.length - conocidos.length;
  return {
    descubiertos: archivos.length,
    conservados,
    pendientes: archivos.length - conservados - revision,
    revision,
    conError: archivos.filter((a) => a.errorCodigo !== null && a.estado !== "CONSERVADO").length,
    bytesConocidos,
    bytesTotales: tamanosDesconocidos === 0 ? bytesConocidos : null,
    tamanosDesconocidos
  };
}

/**
 * El conjunto solo está respaldado cuando TODO recurso descubierto está conservado y Zoom no sigue
 * procesando elementos: un video disponible no alcanza, ni un recurso anunciado sin descarga disponible.
 */
export function respaldoCompletoZoom(
  archivos: readonly ArchivoInventarioZoomVista[],
  opciones: Readonly<{ procesamientoPendiente?: boolean }> = {}
): boolean {
  if (opciones.procesamientoPendiente) {
    return false;
  }
  return archivos.length > 0 && archivos.every((a) => a.estado === "CONSERVADO");
}

/** Enlace a Drive solo para archivos ya conservados y únicamente https en hosts de Google. */
export function enlaceArchivoZoom(
  archivo: Pick<ArchivoInventarioZoomVista, "estado" | "webViewUrl">
): string | null {
  if (archivo.estado !== "CONSERVADO" || !archivo.webViewUrl) {
    return null;
  }
  try {
    const url = new URL(archivo.webViewUrl);
    const hostGoogle = url.hostname === "drive.google.com" || url.hostname === "docs.google.com";
    return url.protocol === "https:" && hostGoogle ? url.toString() : null;
  } catch {
    return null;
  }
}

/** El inventario de Zoom (incluido el histórico sin encuentro vinculado) es solo de administración. */
export function puedeVerInventarioZoom(rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO"): boolean {
  return rol === "ADMINISTRACION";
}

const ETIQUETAS_ESTADO: Readonly<Record<EstadoArchivoZoomVista, string>> = {
  DESCUBIERTO: "Descubierto",
  PROCESANDO_ORIGEN: "Zoom lo está procesando",
  PENDIENTE: "Pendiente de copia",
  COPIANDO: "Copiando a Drive",
  CONSERVADO: "Conservado en Drive",
  ERROR_REINTENTABLE: "Error, se reintentará",
  REQUIERE_REVISION: "Requiere revisión"
};

export function etiquetaEstadoArchivoZoom(estado: EstadoArchivoZoomVista): string {
  return ETIQUETAS_ESTADO[estado];
}

const VARIANTES_ZOOM_LEGIBLES: Readonly<Record<string, string>> = {
  shared_screen_with_speaker_view: "Pantalla compartida con orador",
  shared_screen_with_gallery_view: "Pantalla compartida con galería",
  shared_screen: "Pantalla compartida",
  active_speaker: "Orador activo",
  speaker_view: "Vista del orador",
  gallery_view: "Vista de galería",
  audio_only: "Audio general de la reunión",
  audio_transcript: "Transcripción de audio",
  closed_caption: "Subtítulos (VTT)",
  chat_file: "Chat de la reunión",
  timeline: "Línea de tiempo",
  summary: "Resumen de la reunión",
  meeting_summary: "Resumen de la reunión",
  summary_next_steps: "Próximos pasos del resumen"
};

/** Traduce el identificador de variante de Zoom a una etiqueta humana en español. */
export function describirVarianteZoom(
  variante: string | null | undefined,
  tipoOriginal?: string
): string | null {
  const texto = variante?.trim() ?? "";
  if (!texto) {
    const tipo = (tipoOriginal ?? "").trim().toUpperCase();
    if (tipo === "CHAT") {
      return "Chat de la reunión";
    }
    if (tipo === "CC") {
      return "Subtítulos (VTT)";
    }
    if (tipo === "TRANSCRIPT" || tipo === "AUDIO_TRANSCRIPT") {
      return "Transcripción de audio";
    }
    if (tipo === "TIMELINE") {
      return "Línea de tiempo";
    }
    if (tipo === "SUMMARY") {
      return "Resumen de la reunión";
    }
    return null;
  }
  const pistaParticipante = /^audio\s+only\s*-\s*(.+)$/i.exec(texto);
  if (pistaParticipante) {
    return `Pista de participante · ${pistaParticipante[1]!.trim()}`;
  }
  const conSubtitulos = /\(cc\)$/i.test(texto);
  const clave = texto
    .replace(/\(cc\)$/i, "")
    .trim()
    .toLowerCase();
  const base = VARIANTES_ZOOM_LEGIBLES[clave];
  if (base) {
    return conSubtitulos ? `${base} (con subtítulos)` : base;
  }
  return texto;
}

/**
 * Distingue las pistas individuales de audio por participante y archivos auxiliares técnicos
 * (p. ej. línea de tiempo JSON) para que la tarjeta muestre primero los archivos principales.
 */
export function esArchivoSecundarioZoom(
  fila: Readonly<{ tipoOriginal: string; variante?: string | null }>
): boolean {
  const variante = fila.variante?.trim() ?? "";
  if (/^audio\s+only\s*-/i.test(variante)) {
    return true;
  }
  const cat = categoriaArchivoZoom(fila.tipoOriginal);
  return cat === "LINEA_DE_TIEMPO" || cat === "OTROS";
}

/** Fila del inventario con lo que la biblioteca necesita mostrar de cada archivo. */
export type ArchivoZoomBibliotecaFila = Readonly<{
  id: string;
  tipoOriginal: string;
  variante: string | null;
  extension: string | null;
  estado: EstadoArchivoZoomVista;
  tamanoBytes: bigint | null;
  mimeType: string | null;
  nombreDestino: string;
  webViewUrl: string | null;
  errorCodigo: string | null;
}>;

/** Entrada de la biblioteca: taxonomía Meet para los filtros existentes, etiqueta propia de Zoom para leerla. */
export type ArchivoBibliotecaZoom = Readonly<{
  id: string;
  /** Tipo en la taxonomía Meet (MP4→GRABACION, transcripciones, resumen→NOTAS, resto OTRO). */
  tipo: "GRABACION" | "TRANSCRIPCION" | "LISTA_ASISTENCIA" | "NOTAS" | "OTRO";
  /** Etiqueta legible de la categoría Zoom (Video, Audio, Chat, …). */
  etiqueta: string;
  /** Variante traducida (p. ej. «Pantalla compartida con orador», «Pista de participante · Ana»). */
  descripcion: string | null;
  /** Pista individual de participante o archivo técnico auxiliar. */
  secundario: boolean;
  nombre: string;
  /** Solo https hacia Drive/Docs y solo si está conservado; null mientras tanto. */
  enlace: string | null;
  tamanoBytes: bigint | null;
  mimeType: string | null;
  estado: EstadoArchivoZoomVista;
  estadoEtiqueta: string;
  pendiente: boolean;
  errorCodigo: string | null;
}>;

/** Proyección de un archivo del inventario Zoom hacia la biblioteca de grabaciones. */
export function archivoBibliotecaZoom(fila: ArchivoZoomBibliotecaFila): ArchivoBibliotecaZoom {
  const enlace = enlaceArchivoZoom(fila);
  return {
    id: fila.id,
    tipo: tipoArchivoReunionZoom(fila.tipoOriginal),
    etiqueta: etiquetaCategoriaZoom(categoriaArchivoZoom(fila.tipoOriginal)),
    descripcion: describirVarianteZoom(fila.variante, fila.tipoOriginal),
    secundario: esArchivoSecundarioZoom(fila),
    nombre: fila.nombreDestino,
    enlace,
    tamanoBytes: fila.tamanoBytes,
    mimeType: fila.mimeType,
    estado: fila.estado,
    estadoEtiqueta: etiquetaEstadoArchivoZoom(fila.estado),
    pendiente: fila.estado !== "CONSERVADO",
    errorCodigo: fila.errorCodigo
  };
}
