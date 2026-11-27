import { createHash } from "node:crypto";

const MULTIPLO_BYTES = 256 * 1024;
export const BLOQUE_TRANSFERENCIA_ZOOM_BYTES = 8 * 1024 * 1024;

export type CodigoTransferenciaZoom =
  | "DESCARTE_EXCEDIDO"
  | "ORIGEN_DESALINEADO"
  | "CONFIRMACION_PARCIAL"
  | "SESION_VENCIDA"
  | "ORIGEN_TERMINO_ANTES"
  | "ORIGEN_INCOMPLETO"
  | "ABORTADA";

export class TransferenciaZoomError extends Error {
  constructor(
    readonly codigo: CodigoTransferenciaZoom,
    message: string,
    readonly bytesConfirmados: bigint | null = null,
  ) {
    super(message);
    this.name = "TransferenciaZoomError";
  }
}

export type ResultadoBloqueZoom =
  | Readonly<{ estado: "PARCIAL"; bytesConfirmados: bigint }>
  | Readonly<{ estado: "COMPLETA" }>
  | Readonly<{ estado: "VENCIDA" }>;

export type SubidaBloqueZoom = (
  offset: bigint,
  bytes: Uint8Array,
  opciones: Readonly<{ ultimo: boolean }>,
) => Promise<ResultadoBloqueZoom>;

export type TransferirStreamZoomParams = Readonly<{
  stream: AsyncIterable<Uint8Array>;
  /** Offset hasta el que Drive ya tiene los bytes (fuente de verdad). */
  offsetConfirmado: bigint;
  /** Offset al que corresponde el primer byte del stream (0 si Zoom ignoró Range). */
  offsetOrigen: bigint;
  bloqueBytes?: number;
  /** Tamaño total del archivo en el origen si se conoce: el stream debe llegar exactamente hasta él antes de finalizar la subida. */
  totalConocido: bigint | null;
  maxDescarteBytes?: bigint;
  subirBloque: SubidaBloqueZoom;
  signal?: AbortSignal;
}>;

export type ResultadoTransferenciaZoom = Readonly<{
  bytesTotales: bigint;
  bytesTransferidos: bigint;
  bytesDescartados: bigint;
  /** Solo si el stream cubrió el archivo desde el byte 0; si no, null. */
  sha256: string | null;
}>;

function verificarAbortada(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw new TransferenciaZoomError("ABORTADA", "Transferencia abortada.");
  }
}

/**
 * Pasa el stream de Zoom a Drive con memoria acotada: nunca retiene más de un bloque más el
 * chunk en curso. Lee 1 byte por adelantado para saber qué PUT es el último, descarta de forma
 * acotada el prefijo ya confirmado cuando Zoom ignoró Range y no sube nada si el origen no
 * coincide con el offset confirmado.
 */
export async function transferirStreamZoom(
  params: TransferirStreamZoomParams,
): Promise<ResultadoTransferenciaZoom> {
  const bloque = params.bloqueBytes ?? BLOQUE_TRANSFERENCIA_ZOOM_BYTES;
  if (!Number.isInteger(bloque) || bloque <= 0 || bloque % MULTIPLO_BYTES !== 0) {
    throw new Error("El bloque de transferencia debe ser múltiplo de 256 KiB.");
  }
  const { offsetConfirmado, offsetOrigen, signal } = params;
  if (offsetOrigen > offsetConfirmado) {
    throw new TransferenciaZoomError(
      "ORIGEN_DESALINEADO",
      "El origen empieza después del offset confirmado.",
    );
  }
  const descarte = offsetConfirmado - offsetOrigen;
  if (descarte > (params.maxDescarteBytes ?? 0n)) {
    throw new TransferenciaZoomError(
      "DESCARTE_EXCEDIDO",
      "El prefijo a descartar supera el máximo permitido.",
    );
  }

  const hash = offsetOrigen === 0n ? createHash("sha256") : null;
  let porDescartar = descarte;
  let offsetSiguiente = offsetConfirmado;
  let transferidos = 0n;
  // Buffer acotado: parte pendiente de enviar.
  let pendiente: Uint8Array[] = [];
  let pendienteBytes = 0;

  const juntar = (n: number): Uint8Array => {
    const salida = new Uint8Array(n);
    let escrito = 0;
    const resto: Uint8Array[] = [];
    for (const parte of pendiente) {
      if (escrito >= n) {
        resto.push(parte);
        continue;
      }
      const toma = Math.min(parte.byteLength, n - escrito);
      salida.set(parte.subarray(0, toma), escrito);
      escrito += toma;
      if (toma < parte.byteLength) {
        resto.push(parte.subarray(toma));
      }
    }
    pendiente = resto;
    pendienteBytes -= n;
    return salida;
  };

  const enviar = async (bytes: Uint8Array, ultimo: boolean): Promise<void> => {
    verificarAbortada(signal);
    const r = await params.subirBloque(offsetSiguiente, bytes, { ultimo });
    if (r.estado === "VENCIDA") {
      throw new TransferenciaZoomError("SESION_VENCIDA", "La sesión de subida venció.");
    }
    const esperado = offsetSiguiente + BigInt(bytes.byteLength);
    if (r.estado === "PARCIAL" && r.bytesConfirmados !== esperado) {
      throw new TransferenciaZoomError(
        "CONFIRMACION_PARCIAL",
        "Drive confirmó menos bytes de los enviados.",
        r.bytesConfirmados,
      );
    }
    offsetSiguiente = esperado;
    transferidos += BigInt(bytes.byteLength);
    verificarAbortada(signal);
  };

  for await (const chunk of params.stream) {
    verificarAbortada(signal);
    hash?.update(chunk);
    let parte = chunk;
    if (porDescartar > 0n) {
      const quitar =
        porDescartar < BigInt(parte.byteLength) ? Number(porDescartar) : parte.byteLength;
      porDescartar -= BigInt(quitar);
      parte = parte.subarray(quitar);
    }
    if (parte.byteLength === 0) {
      continue;
    }
    pendiente.push(parte);
    pendienteBytes += parte.byteLength;
    // Con 1 byte de adelanto: un bloque completo solo es intermedio si hay más datos detrás.
    while (pendienteBytes > bloque) {
      await enviar(juntar(bloque), false);
    }
  }

  if (porDescartar > 0n) {
    throw new TransferenciaZoomError(
      "ORIGEN_TERMINO_ANTES",
      "El origen terminó antes del offset confirmado.",
    );
  }
  // Un 206 puede cubrir solo parte del archivo: finalizar aquí dejaría en Drive un archivo truncado.
  // No se envía el último bloque; el siguiente intento reanuda desde lo confirmado y pide el resto.
  if (
    params.totalConocido !== null &&
    offsetSiguiente + BigInt(pendienteBytes) !== params.totalConocido
  ) {
    throw new TransferenciaZoomError(
      "ORIGEN_INCOMPLETO",
      "El origen terminó antes del tamaño total anunciado.",
    );
  }
  await enviar(juntar(pendienteBytes), true);

  return {
    bytesTotales: offsetSiguiente,
    bytesTransferidos: transferidos,
    bytesDescartados: descarte,
    sha256: hash ? hash.digest("hex") : null,
  };
}
