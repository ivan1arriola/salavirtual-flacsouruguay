import { ZoomApiError, errorPorEstado, pedirZoom, type AutenticacionZoom } from "./zoom-http";

const MAX_REDIRECCIONES = 3;
const BYTES_POR_GB = 1024 ** 3;
const MAX_DESCARTE_GB_POR_DEFECTO = 2;
const HOSTS_ZOOM_POR_DEFECTO = "zoom.us,*.zoom.us,zoomgov.com,*.zoomgov.com";
const SIN_TOKEN = "sin-credencial";

export type OpcionesDescargaZoom = Readonly<{
  /** Algunos archivos legítimos son JSON (TIMELINE, SUMMARY); por defecto un JSON con 200 se trata como error de API. */
  permitirJson?: boolean;
}>;

export type DescargaZoomHttp =
  | Readonly<{
      tipo: "CONTENIDO";
      /** PARCIAL entrega desde `offset`; COMPLETO entrega el archivo entero. */
      modo: "PARCIAL" | "COMPLETO";
      /** RANGE_IGNORADO: Zoom respondió 200 a un Range; el prefijo ya fue descartado en este flujo. */
      etiquetas: readonly "RANGE_IGNORADO"[];
      /** Los bytes llegan por este flujo; si la cantidad no coincide con lo anunciado, el flujo falla. */
      contenido: ReadableStream<Uint8Array>;
      totalBytes: bigint | null;
      bytesEsperados: bigint | null;
      contentType: string | null;
      /** Bytes entregados hasta el momento (medidos por el flujo). */
      bytesRecibidos: () => bigint;
    }>
  | Readonly<{ tipo: "REQUIERE_REVISION"; motivo: "RANGE_IGNORADO_DESCARTE_EXCEDE_MAXIMO" }>;

function listaDeEntorno(nombre: string, porDefecto: string): readonly string[] {
  return (process.env[nombre] ?? porDefecto)
    .split(",")
    .map((p) => p.trim().toLowerCase())
    .filter((p) => p !== "");
}

function hostCoincide(host: string, patrones: readonly string[]): boolean {
  const h = host.toLowerCase();
  return patrones.some((patron) =>
    patron.startsWith("*.") ? h.endsWith(patron.slice(1)) && h.length > patron.length - 1 : h === patron
  );
}

function urlHttpsONula(valor: string, base?: string): URL | null {
  try {
    const url = new URL(valor, base);
    return url.protocol === "https:" && url.username === "" && url.password === "" ? url : null;
  } catch {
    return null;
  }
}

function maximoDescarteBytes(): bigint {
  const gb = Number(process.env.ZOOM_ARCHIVOS_MAX_DESCARTE_GB ?? MAX_DESCARTE_GB_POR_DEFECTO);
  const validos = Number.isFinite(gb) && gb >= 0 ? gb : MAX_DESCARTE_GB_POR_DEFECTO;
  return BigInt(Math.floor(validos * BYTES_POR_GB));
}

function bigintONulo(valor: string | null): bigint | null {
  return valor !== null && /^\d+$/.test(valor.trim()) ? BigInt(valor.trim()) : null;
}

function esRedireccion(status: number): boolean {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

function validarTipoContenido(response: Response, opciones: OpcionesDescargaZoom): string | null {
  const tipo = response.headers.get("content-type");
  const media = (tipo ?? "").split(";")[0].trim().toLowerCase();
  const esHtml = media === "text/html" || media === "application/xhtml+xml";
  const esJson = media === "application/json" || media.endsWith("+json");
  if (esHtml || (esJson && !opciones.permitirJson)) {
    void response.body?.cancel().catch(() => undefined);
    throw new ZoomApiError("CONTENIDO_NO_ES_ARCHIVO", "descarga", { status: response.status });
  }
  return tipo;
}

type Medicion = Readonly<{ recibidos: () => bigint; flujo: ReadableStream<Uint8Array> }>;

/** Descarta `omitir` bytes iniciales, cuenta lo entregado y verifica la cantidad esperada. */
function medir(cuerpo: ReadableStream<Uint8Array>, omitir: bigint, esperado: bigint | null): Medicion {
  let porOmitir = omitir;
  let entregados = 0n;
  const transformador = new TransformStream<Uint8Array, Uint8Array>({
    transform(trozo, controlador) {
      let parte = trozo;
      if (porOmitir > 0n) {
        const descartar = porOmitir < BigInt(parte.byteLength) ? Number(porOmitir) : parte.byteLength;
        porOmitir -= BigInt(descartar);
        parte = parte.subarray(descartar);
      }
      if (parte.byteLength === 0) {
        return;
      }
      entregados += BigInt(parte.byteLength);
      if (esperado !== null && entregados > esperado) {
        throw new ZoomApiError("TAMANO_INCONSISTENTE", "descarga");
      }
      controlador.enqueue(parte);
    },
    flush() {
      if (porOmitir > 0n || (esperado !== null && entregados !== esperado)) {
        throw new ZoomApiError("TAMANO_INCONSISTENTE", "descarga");
      }
    }
  });
  return { recibidos: () => entregados, flujo: cuerpo.pipeThrough(transformador) };
}

function contenidoDe(
  response: Response,
  modo: "PARCIAL" | "COMPLETO",
  etiquetas: readonly "RANGE_IGNORADO"[],
  omitir: bigint,
  esperado: bigint | null,
  total: bigint | null,
  contentType: string | null
): DescargaZoomHttp {
  if (!response.body) {
    throw new ZoomApiError("CONTENIDO_NO_ES_ARCHIVO", "descarga", { status: response.status });
  }
  const { flujo, recibidos } = medir(response.body, omitir, esperado);
  return {
    tipo: "CONTENIDO",
    modo,
    etiquetas,
    contenido: flujo,
    totalBytes: total,
    bytesEsperados: esperado,
    contentType,
    bytesRecibidos: recibidos
  };
}

async function resolverRespuestaFinal(
  response: Response,
  offset: bigint,
  opciones: OpcionesDescargaZoom
): Promise<DescargaZoomHttp> {
  if (response.status !== 200 && response.status !== 206) {
    await response.body?.cancel().catch(() => undefined);
    const error = errorPorEstado("descarga", response.status);
    throw error.code === "SOLICITUD_RECHAZADA" || error.code === "CAPACIDAD_PENDIENTE"
      ? new ZoomApiError("DESCARGA_RECHAZADA", "descarga", { status: response.status })
      : error;
  }
  const contentType = validarTipoContenido(response, opciones);
  const comprimido = (response.headers.get("content-encoding") ?? "identity").toLowerCase() !== "identity";
  const longitud = comprimido ? null : bigintONulo(response.headers.get("content-length"));

  if (response.status === 206) {
    const coincide = /^bytes (\d+)-(\d+)\/(\d+|\*)$/.exec(
      (response.headers.get("content-range") ?? "").trim()
    );
    const inicio = coincide ? BigInt(coincide[1]) : null;
    const fin = coincide ? BigInt(coincide[2]) : null;
    if (inicio === null || fin === null || inicio !== offset || fin < inicio) {
      await response.body?.cancel().catch(() => undefined);
      throw new ZoomApiError("CONTENT_RANGE_INVALIDO", "descarga", { status: 206 });
    }
    const esperado = fin - inicio + 1n;
    const total = coincide && coincide[3] !== "*" ? BigInt(coincide[3]) : null;
    if ((longitud !== null && longitud !== esperado) || (total !== null && fin >= total)) {
      await response.body?.cancel().catch(() => undefined);
      throw new ZoomApiError("CONTENT_RANGE_INVALIDO", "descarga", { status: 206 });
    }
    return contenidoDe(response, "PARCIAL", [], 0n, esperado, total, contentType);
  }

  if (offset === 0n) {
    return contenidoDe(response, "COMPLETO", [], 0n, longitud, longitud, contentType);
  }
  // 200 a un Range: Zoom ignoró el rango y reenvía el archivo desde el principio.
  if (offset > maximoDescarteBytes()) {
    await response.body?.cancel().catch(() => undefined);
    return { tipo: "REQUIERE_REVISION", motivo: "RANGE_IGNORADO_DESCARTE_EXCEDE_MAXIMO" };
  }
  const esperado = longitud !== null ? longitud - offset : null;
  if (esperado !== null && esperado < 0n) {
    await response.body?.cancel().catch(() => undefined);
    throw new ZoomApiError("CONTENT_RANGE_INVALIDO", "descarga", { status: 200 });
  }
  return contenidoDe(response, "PARCIAL", ["RANGE_IGNORADO"], offset, esperado, longitud, contentType);
}

/**
 * Abre la descarga de un archivo de Zoom desde `offset`. La solicitud a Zoom lleva Authorization
 * solo si el host está en ZOOM_ARCHIVOS_HOSTS_ZOOM; las redirecciones (URL firmada del CDN) se siguen
 * a mano, solo por HTTPS, solo hacia hosts de Zoom o de ZOOM_ARCHIVOS_HOSTS_CDN y SIN Authorization.
 * Los errores no incluyen la URL ni su destino.
 */
export async function abrirDescargaZoomHttp(
  auth: AutenticacionZoom,
  urlDescarga: string,
  offset: number | bigint,
  signal: AbortSignal,
  opciones: OpcionesDescargaZoom = {}
): Promise<DescargaZoomHttp> {
  const desde = BigInt(offset);
  if (desde < 0n) {
    throw new RangeError("offset negativo");
  }
  const hostsZoom = listaDeEntorno("ZOOM_ARCHIVOS_HOSTS_ZOOM", HOSTS_ZOOM_POR_DEFECTO);
  const hostsDestino = [...hostsZoom, ...listaDeEntorno("ZOOM_ARCHIVOS_HOSTS_CDN", "")];
  const rango: Record<string, string> = desde > 0n ? { Range: `bytes=${desde}-` } : {};

  const inicial = urlHttpsONula(urlDescarga);
  if (!inicial || !hostCoincide(inicial.hostname, hostsZoom)) {
    throw new ZoomApiError("HOST_NO_PERMITIDO", "descarga");
  }

  let actual = inicial;
  let response = await pedirZoom(
    auth,
    "descarga",
    (token) =>
      fetch(actual.href, {
        redirect: "manual",
        headers: { Authorization: `Bearer ${token}`, ...rango },
        signal
      }),
    signal
  );

  for (let saltos = 0; esRedireccion(response.status); saltos += 1) {
    const ubicacion = response.headers.get("location");
    await response.body?.cancel().catch(() => undefined);
    if (saltos >= MAX_REDIRECCIONES) {
      throw new ZoomApiError("REDIRECCIONES_EXCESIVAS", "descarga");
    }
    const destino = ubicacion ? urlHttpsONula(ubicacion, actual.href) : null;
    if (!destino || !hostCoincide(destino.hostname, hostsDestino)) {
      throw new ZoomApiError("DESTINO_NO_PERMITIDO", "descarga");
    }
    actual = destino;
    // El destino viene firmado: no se le reenvía Authorization.
    response = await pedirZoom(
      SIN_TOKEN,
      "descarga",
      () => fetch(actual.href, { redirect: "manual", headers: { ...rango }, signal }),
      signal
    );
  }

  return resolverRespuestaFinal(response, desde, opciones);
}
