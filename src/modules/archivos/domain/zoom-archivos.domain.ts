import type { ArchivoOrigenZoom, ReferenciaOcurrenciaZoom } from "./zoom-archivos.types";

/** Funcion de hash inyectada; el dominio no usa criptografia con efectos. */
export type HashZoom = (texto: string) => string;

export const TIPOS_ARCHIVO_ZOOM_CONOCIDOS = Object.freeze([
  "MP4",
  "M4A",
  "TIMELINE",
  "TRANSCRIPT",
  "CHAT",
  "CC",
  "CSV",
  "SUMMARY",
  "POLL",
  "QA",
  "THUMBNAIL",
  "MP3",
  "AUDIO_TRANSCRIPT",
  "TB"
] as const);

export type TipoArchivoZoom = (typeof TIPOS_ARCHIVO_ZOOM_CONOCIDOS)[number] | "OTRO";

export type ObservacionInventarioZoom =
  | Readonly<{ tipo: "ELEMENTO_INVALIDO"; coleccion: string; indice: number }>
  | Readonly<{ tipo: "METADATO_INVALIDO"; coleccion: string; indice: number; campo: string }>
  | Readonly<{ tipo: "IDENTIDAD_AMBIGUA"; coleccion: string; claveOrigen: string; multiplicidad: number }>;

export type ResultadoInventarioZoom = Readonly<{
  recursos: readonly ArchivoOrigenZoom[];
  observaciones: readonly ObservacionInventarioZoom[];
  /** Hay elementos sin ID que aun se procesan en Zoom: se inventarian al completarse. */
  procesamientoPendiente: boolean;
}>;

type Candidato = Readonly<{
  recurso: ArchivoOrigenZoom;
  observaciones: readonly ObservacionInventarioZoom[];
  pendienteSinId: boolean;
}>;

type Registro = Readonly<Record<string, unknown>>;

export function clasificarTipoArchivoZoom(tipoOriginal: string): TipoArchivoZoom {
  const normalizado = tipoOriginal.trim().toUpperCase();
  return (TIPOS_ARCHIVO_ZOOM_CONOCIDOS as readonly string[]).includes(normalizado)
    ? (normalizado as TipoArchivoZoom)
    : "OTRO";
}

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function textoONulo(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) {
    return String(valor);
  }
  if (typeof valor !== "string") {
    return null;
  }
  const limpio = valor.trim();
  return limpio === "" ? null : limpio;
}

function fechaONula(valor: unknown): Date | null {
  const texto = textoONulo(valor);
  if (!texto) {
    return null;
  }
  const fecha = new Date(texto);
  return Number.isNaN(fecha.getTime()) ? null : fecha;
}

function bytesONulo(valor: unknown): bigint | null {
  if (typeof valor === "number" && Number.isSafeInteger(valor) && valor >= 0) {
    return BigInt(valor);
  }
  if (typeof valor === "string" && /^\d+$/.test(valor.trim())) {
    return BigInt(valor.trim());
  }
  return null;
}

function construirCandidato(
  ocurrencia: ReferenciaOcurrenciaZoom,
  coleccion: string,
  indice: number,
  elemento: Registro,
  hash: HashZoom
): Candidato {
  const archivoZoomId = textoONulo(elemento.id);
  const tipoOriginal = textoONulo(elemento.file_type) ?? "OTRO";
  const variante = textoONulo(elemento.recording_type) ?? textoONulo(elemento.file_name);
  const extensionBruta = textoONulo(elemento.file_extension);
  const extension = extensionBruta ? extensionBruta.toLowerCase() : null;
  const estadoBruto = textoONulo(elemento.status);
  const estadoOrigen = estadoBruto ? estadoBruto.toLowerCase() : null;
  const inicioAt = fechaONula(elemento.recording_start);
  const finAt = fechaONula(elemento.recording_end);
  const tamanoBytes = bytesONulo(elemento.file_size);

  const invalidos = [
    ["recording_start", inicioAt, elemento.recording_start],
    ["recording_end", finAt, elemento.recording_end],
    ["file_size", tamanoBytes, elemento.file_size]
  ]
    .filter(([, convertido, original]) => convertido === null && textoONulo(original) !== null)
    .map(([campo]): ObservacionInventarioZoom => ({
      tipo: "METADATO_INVALIDO",
      coleccion,
      indice,
      campo: String(campo)
    }));

  const alcance = `${ocurrencia.cuentaZoomId}|${ocurrencia.uuid}`;
  // Sin ID: coleccion, tipo, variante, inicio y extension. Nunca download_url ni
  // recording_end (llega vacio mientras Zoom procesa), ni parametros de autorizacion.
  const identidad =
    archivoZoomId !== null
      ? JSON.stringify([alcance, "id", archivoZoomId])
      : JSON.stringify([
          alcance,
          "meta",
          coleccion,
          tipoOriginal.toUpperCase(),
          variante,
          inicioAt?.toISOString() ?? null,
          extension
        ]);

  const procesando = estadoOrigen === "processing";
  const urlDisponible = textoONulo(elemento.download_url) !== null;

  return {
    recurso: {
      claveOrigen: hash(identidad),
      archivoZoomId,
      coleccion,
      tipoOriginal,
      variante,
      extension,
      inicioAt,
      finAt,
      tamanoBytes,
      estadoOrigen,
      descargable: urlDisponible && !procesando && (estadoOrigen === null || estadoOrigen === "completed")
    },
    observaciones: invalidos,
    pendienteSinId: archivoZoomId === null && procesando
  };
}

/**
 * Normaliza la respuesta de grabaciones de Zoom de una ocurrencia. Recorre toda
 * propiedad de primer nivel que sea una lista (recording_files,
 * participant_audio_files y colecciones auxiliares). No expone URLs ni tokens.
 */
export function normalizarInventarioZoom(
  ocurrencia: ReferenciaOcurrenciaZoom,
  respuesta: unknown,
  hash: HashZoom
): ResultadoInventarioZoom {
  const colecciones = esRegistro(respuesta)
    ? Object.entries(respuesta).filter((par): par is [string, unknown[]] => Array.isArray(par[1]))
    : [];

  const entradas = colecciones.flatMap(([coleccion, elementos]) =>
    elementos.map((elemento, indice) => ({ coleccion, indice, elemento }))
  );

  const invalidos = entradas
    .filter(({ elemento }) => !esRegistro(elemento))
    .map(({ coleccion, indice }): ObservacionInventarioZoom => ({
      tipo: "ELEMENTO_INVALIDO",
      coleccion,
      indice
    }));

  const candidatos = entradas.flatMap(({ coleccion, indice, elemento }) =>
    esRegistro(elemento) ? [construirCandidato(ocurrencia, coleccion, indice, elemento, hash)] : []
  );

  const pendientes = candidatos.filter((c) => c.pendienteSinId);
  const inventariables = candidatos.filter((c) => !c.pendienteSinId);

  const porClave = inventariables.reduce<ReadonlyMap<string, readonly Candidato[]>>(
    (acumulado, candidato) =>
      new Map([
        ...acumulado,
        [candidato.recurso.claveOrigen, [...(acumulado.get(candidato.recurso.claveOrigen) ?? []), candidato]]
      ]),
    new Map()
  );

  const grupos = [...porClave.values()];
  const ambiguos = grupos
    .filter((grupo) => grupo[0].recurso.archivoZoomId === null && grupo.length > 1)
    .map((grupo): ObservacionInventarioZoom => ({
      tipo: "IDENTIDAD_AMBIGUA",
      coleccion: grupo[0].recurso.coleccion,
      claveOrigen: grupo[0].recurso.claveOrigen,
      multiplicidad: grupo.length
    }));

  return {
    recursos: grupos.map((grupo) => grupo[0].recurso),
    observaciones: [...invalidos, ...candidatos.flatMap((c) => c.observaciones), ...ambiguos],
    procesamientoPendiente: pendientes.length > 0
  };
}

function sanearSegmento(valor: string, largoMaximo: number): string {
  return valor
    .normalize("NFC")

    .replace(/[\u0000-\u001f\u007f\\/:*?"<>|]+/g, "-")
    .replace(/\s+/g, " ")
    .replace(/\.{2,}/g, ".")
    .trim()
    .replace(/^[-. ]+|[-. ]+$/g, "")
    .slice(0, largoMaximo);
}

/**
 * Nombre legible y seguro para el archivo dentro de la carpeta del encuentro:
 * fecha_TIPO_variante_idEstable[_sufijo].extension. No contiene separadores de ruta.
 * El sufijo opcional (saneado) desambigua nombres que colisionan tras sanear o truncar.
 */
export function nombreArchivoZoom(
  ocurrencia: ReferenciaOcurrenciaZoom,
  archivo: ArchivoOrigenZoom,
  sufijo?: string
): string {
  const fecha = ocurrencia.inicioRealAt.toISOString().slice(0, 10);
  const tipo = sanearSegmento(archivo.tipoOriginal, 30) || "OTRO";
  const variante = archivo.variante ? sanearSegmento(archivo.variante, 60) : "";
  const identificador = sanearSegmento(archivo.archivoZoomId ?? archivo.claveOrigen, 60) || "sin-id";
  const extension = archivo.extension ? sanearSegmento(archivo.extension.replace(/^\./, ""), 10) : "";
  const desambiguador = sufijo ? sanearSegmento(sufijo, 80) : "";
  const cuerpo = [fecha, tipo, variante, identificador, desambiguador]
    .filter((parte) => parte !== "")
    .join("_");
  return extension ? `${cuerpo}.${extension}` : cuerpo;
}
