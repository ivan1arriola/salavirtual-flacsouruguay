import type { TipoArtefactoMeet } from "./meet-artifacts.domain";
import {
  clasificarTipoArchivoZoom,
  nombreArchivoZoom,
  type HashZoom,
  type ObservacionInventarioZoom
} from "./zoom-archivos.domain";
import type { ArchivoOrigenZoom, EstadoArchivoZoom, ReferenciaOcurrenciaZoom } from "./zoom-archivos.types";

export type EstadoCalculadoArchivoZoom = Readonly<{ estado: EstadoArchivoZoom; errorCodigo: string | null }>;

/** Claves de origen con candidatos indistinguibles y su multiplicidad observada. */
export function multiplicidadesAmbiguasZoom(
  observaciones: readonly ObservacionInventarioZoom[]
): ReadonlyMap<string, number> {
  return new Map(
    observaciones.flatMap((o) =>
      o.tipo === "IDENTIDAD_AMBIGUA" ? [[o.claveOrigen, o.multiplicidad] as const] : []
    )
  );
}

/** Estado con que se registra un recurso descubierto por primera vez. */
export function estadoInicialArchivoZoom(
  recurso: ArchivoOrigenZoom,
  multiplicidad: number
): EstadoCalculadoArchivoZoom {
  if (multiplicidad > 1) {
    return { estado: "REQUIERE_REVISION", errorCodigo: "IDENTIDAD_AMBIGUA" };
  }
  if (recurso.descargable) {
    return { estado: "PENDIENTE", errorCodigo: null };
  }
  if (recurso.estadoOrigen === "processing") {
    return { estado: "PROCESANDO_ORIGEN", errorCodigo: null };
  }
  return { estado: "DESCUBIERTO", errorCodigo: "SIN_DESCARGA_DISPONIBLE" };
}

/**
 * Transición al volver a inventariar un recurso ya registrado; null = conservar el estado.
 * CONSERVADO y COPIANDO nunca se tocan (la multiplicidad solo se registra); los estados
 * del worker (PENDIENTE, ERROR_REINTENTABLE) y la revisión manual tampoco se reinician.
 */
export function estadoTrasReinventarioZoom(
  actual: EstadoArchivoZoom,
  recurso: ArchivoOrigenZoom,
  multiplicidad: number
): EstadoCalculadoArchivoZoom | null {
  if (actual === "CONSERVADO" || actual === "COPIANDO" || actual === "REQUIERE_REVISION") {
    return null;
  }
  if (multiplicidad > 1) {
    return { estado: "REQUIERE_REVISION", errorCodigo: "IDENTIDAD_AMBIGUA" };
  }
  if (actual !== "DESCUBIERTO" && actual !== "PROCESANDO_ORIGEN") {
    return null;
  }
  const siguiente = estadoInicialArchivoZoom(recurso, multiplicidad);
  return siguiente.estado === actual ? null : siguiente;
}

export type NombreDestinoAsignado = Readonly<{ nombre: string; desambiguado: boolean; colision: boolean }>;

/** Orden estable sin mutar la entrada. */
function ordenar<T>(items: readonly T[], antes: (a: T, b: T) => boolean): readonly T[] {
  return items.reduce<readonly T[]>((orden, actual) => {
    const indice = orden.findIndex((item) => antes(actual, item));
    return indice < 0 ? [...orden, actual] : [...orden.slice(0, indice), actual, ...orden.slice(indice)];
  }, []);
}

function claveComparable(nombre: string): string {
  return nombre.normalize("NFC").toLowerCase();
}

function nombreConContador(
  ocurrencia: ReferenciaOcurrenciaZoom,
  recurso: ArchivoOrigenZoom,
  tomados: ReadonlySet<string>,
  contador: number
): string {
  const candidato = nombreArchivoZoom(ocurrencia, recurso, `${recurso.claveOrigen}-${contador}`);
  return tomados.has(claveComparable(candidato))
    ? nombreConContador(ocurrencia, recurso, tomados, contador + 1)
    : candidato;
}

function asignarNombre(
  ocurrencia: ReferenciaOcurrenciaZoom,
  recurso: ArchivoOrigenZoom,
  tomados: ReadonlySet<string>
): NombreDestinoAsignado {
  const candidatos = [
    nombreArchivoZoom(ocurrencia, recurso),
    nombreArchivoZoom(ocurrencia, recurso, recurso.claveOrigen.slice(0, 12)),
    nombreArchivoZoom(ocurrencia, recurso, recurso.claveOrigen)
  ];
  const libre = candidatos.findIndex((c) => !tomados.has(claveComparable(c)));
  return libre >= 0
    ? { nombre: candidatos[libre], desambiguado: libre > 0, colision: false }
    : { nombre: nombreConContador(ocurrencia, recurso, tomados, 2), desambiguado: true, colision: true };
}

type NombresAcumulados = Readonly<{
  tomados: ReadonlySet<string>;
  asignados: ReadonlyMap<string, NombreDestinoAsignado>;
}>;

/**
 * Asigna nombres de destino únicos dentro de la ocurrencia (comparando en NFC y sin
 * distinguir mayúsculas). Ante colisión agrega un prefijo de la clave de origen, luego la
 * clave completa y, como último recurso, un contador marcado como colisión. El orden por
 * clave de origen hace la asignación determinista.
 */
export function asignarNombresDestinoZoom(
  ocurrencia: ReferenciaOcurrenciaZoom,
  recursos: readonly ArchivoOrigenZoom[],
  ocupados: Iterable<string>
): ReadonlyMap<string, NombreDestinoAsignado> {
  const inicial: NombresAcumulados = {
    tomados: new Set([...ocupados].map(claveComparable)),
    asignados: new Map()
  };
  return ordenar(recursos, (a, b) => a.claveOrigen < b.claveOrigen).reduce<NombresAcumulados>(
    (acumulado, recurso) => {
      const asignado = asignarNombre(ocurrencia, recurso, acumulado.tomados);
      return {
        tomados: new Set([...acumulado.tomados, claveComparable(asignado.nombre)]),
        asignados: new Map([...acumulado.asignados, [recurso.claveOrigen, asignado]])
      };
    },
    inicial
  ).asignados;
}

/**
 * Prefijo de `externalResourceName` de toda referencia local creada desde el inventario
 * Zoom. Los consumidores Meet existentes lo usan para excluir esas filas.
 */
export const PREFIJO_REFERENCIA_ARCHIVO_ZOOM = "zoom/";

/** `externalResourceName` de la referencia local: no expone cuenta ni UUID. */
export function referenciaExternaArchivoZoom(
  cuentaZoomId: string,
  uuid: string,
  claveOrigen: string,
  hash: HashZoom
): string {
  return `${PREFIJO_REFERENCIA_ARCHIVO_ZOOM}${hash(cuentaZoomId)}/${hash(uuid)}/${claveOrigen}`;
}

/**
 * Bytes que cuenta la reserva de un intento abandonado (lease vencido): lo que Drive
 * confirmó desde que se reservó. Nunca negativo (una sesión reiniciada no resta).
 */
export function bytesTransferidosReservaAbandonadaZoom(
  bytesConfirmadosInicio: bigint,
  bytesConfirmadosActuales: bigint
): bigint {
  return bytesConfirmadosActuales > bytesConfirmadosInicio
    ? bytesConfirmadosActuales - bytesConfirmadosInicio
    : 0n;
}

/** Tipo local del ArchivoReunion: solo el MP4 es grabación; audios y auxiliares quedan como OTRO. */
export function tipoArchivoReunionZoom(tipoOriginal: string): TipoArtefactoMeet {
  switch (clasificarTipoArchivoZoom(tipoOriginal)) {
    case "MP4":
      return "GRABACION";
    case "TRANSCRIPT":
    case "CC":
    case "AUDIO_TRANSCRIPT":
      return "TRANSCRIPCION";
    case "SUMMARY":
      return "NOTAS";
    default:
      return "OTRO";
  }
}

/** Mensaje de error persistible: sin URLs, tokens ni credenciales, y acotado. */
export function sanearErrorZoom(texto: string | null | undefined, largoMaximo = 500): string | null {
  if (texto === null || texto === undefined) {
    return null;
  }
  const limpio = texto
    .replace(/\S+/g, (parte) => (parte.includes("://") ? "[url]" : parte))
    .replace(/\bBearer\s+\S+/gi, "Bearer [redactado]")
    .replace(
      /\b(access_token|refresh_token|token|signature|sig|key|password|secret|authorization|client_secret)\s*[=:]\s*[^&\s]+/gi,
      "$1=[redactado]"
    )
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, largoMaximo);
  return limpio === "" ? null : limpio;
}

export type PrioridadTransferenciaZoom = "RECIENTE" | "HISTORICO";

export type LimitesCupoZoom = Readonly<{
  topeBytes: bigint;
  /** Parte del tope que el histórico no puede consumir (encuentros recientes). */
  reservaRecienteBytes: bigint;
  ventanaMs: number;
}>;

export type ReservaVigenteZoom = Readonly<{ reservadoAt: Date; bytes: bigint }>;

export type EvaluacionCupoZoom =
  | Readonly<{ cabe: true; usadoBytes: bigint; limiteBytes: bigint }>
  | Readonly<{
      cabe: false;
      usadoBytes: bigint;
      limiteBytes: bigint;
      disponibleBytes: bigint;
      liberacionEstimadaAt: Date | null;
    }>;

/**
 * Tope de transferencia en ventana móvil: cuentan las reservas con reservadoAt dentro de
 * (ahora - ventana, ahora]. Un RECIENTE puede llegar al tope; un HISTORICO solo hasta
 * tope - reservaReciente. Si no cabe, estima cuándo salen de la ventana las reservas
 * necesarias (null si el archivo supera el límite aplicable).
 */
export function evaluarCupoTransferenciaZoom(
  reservas: readonly ReservaVigenteZoom[],
  bytes: bigint,
  prioridad: PrioridadTransferenciaZoom,
  limites: LimitesCupoZoom,
  ahora: Date
): EvaluacionCupoZoom {
  if (bytes < 0n) {
    throw new RangeError("Los bytes a reservar no pueden ser negativos.");
  }
  if (!(limites.ventanaMs > 0)) {
    throw new RangeError("La ventana del cupo debe ser positiva.");
  }
  if (
    limites.topeBytes < 0n ||
    limites.reservaRecienteBytes < 0n ||
    limites.reservaRecienteBytes > limites.topeBytes
  ) {
    throw new RangeError("La reserva para recientes debe estar entre 0 y el tope.");
  }
  const desde = ahora.getTime() - limites.ventanaMs;
  const vigentes = ordenar(
    reservas.filter((r) => r.reservadoAt.getTime() > desde),
    (a, b) => a.reservadoAt.getTime() < b.reservadoAt.getTime()
  );
  const usadoBytes = vigentes.reduce((suma, r) => suma + r.bytes, 0n);
  const limiteBytes =
    prioridad === "RECIENTE" ? limites.topeBytes : limites.topeBytes - limites.reservaRecienteBytes;
  if (usadoBytes + bytes <= limiteBytes) {
    return { cabe: true, usadoBytes, limiteBytes };
  }

  const disponibleBytes = limiteBytes > usadoBytes ? limiteBytes - usadoBytes : 0n;
  // Bytes que salen de la ventana a medida que vencen las reservas más antiguas.
  const liberados = vigentes.reduce<readonly bigint[]>(
    (acumulado, r) => [...acumulado, (acumulado.length > 0 ? acumulado[acumulado.length - 1] : 0n) + r.bytes],
    []
  );
  const indice =
    bytes <= limiteBytes
      ? liberados.findIndex((liberado) => usadoBytes - liberado + bytes <= limiteBytes)
      : -1;
  const liberacionEstimadaAt =
    indice >= 0 ? new Date(vigentes[indice].reservadoAt.getTime() + limites.ventanaMs) : null;
  return { cabe: false, usadoBytes, limiteBytes, disponibleBytes, liberacionEstimadaAt };
}
