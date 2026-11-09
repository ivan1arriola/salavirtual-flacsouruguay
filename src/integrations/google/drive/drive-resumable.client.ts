import type { JWT } from "google-auth-library";
import { GOOGLE_HTTP_TIMEOUT_MS } from "../auth";
import { DRIVE_API_BASE_URL, DRIVE_FOLDER_MIME, DRIVE_UPLOAD_API_BASE_URL } from "./drive-files.client";

/** Drive exige que los bloques intermedios sean múltiplos de 256 KiB. */
export const DRIVE_BLOQUE_MULTIPLO_BYTES = 256 * 1024;
export const DRIVE_ZOOM_ORIGEN_PROPERTY = "flacsoZoomOrigen";

export type ResultadoSubidaDrive =
  | Readonly<{ estado: "PARCIAL"; bytesConfirmados: bigint }>
  | Readonly<{ estado: "COMPLETA"; archivo: ArchivoDriveSubido }>
  | Readonly<{ estado: "VENCIDA" }>;

export type ArchivoDriveSubido = Readonly<{
  id: string;
  name?: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
}>;

type RespuestaHttp = { status: number; headers?: Record<string, unknown>; data?: unknown };

/** Nunca incluye el cuerpo ni la URL de sesión: ambos pueden ser sensibles. */
function errorSaneado(operacion: string, status: number): Error {
  return new Error(`Drive reanudable: ${operacion} respondió con estado inesperado ${status}.`);
}

function leerBytesConfirmados(headers: Record<string, unknown> | undefined): bigint {
  const rango = headers?.range ?? headers?.Range;
  if (typeof rango !== "string") return 0n;
  const m = /^bytes=0-(\d+)$/.exec(rango.trim());
  return m ? BigInt(m[1]!) + 1n : 0n;
}

function interpretar(operacion: string, r: RespuestaHttp): ResultadoSubidaDrive {
  if (r.status === 308) return { estado: "PARCIAL", bytesConfirmados: leerBytesConfirmados(r.headers) };
  if (r.status === 200 || r.status === 201) {
    const archivo = r.data as ArchivoDriveSubido | undefined;
    if (!archivo || typeof archivo !== "object" || !archivo.id) {
      throw new Error(`Drive reanudable: ${operacion} terminó sin identificar el archivo.`);
    }
    return { estado: "COMPLETA", archivo };
  }
  if (r.status === 404 || r.status === 410) return { estado: "VENCIDA" };
  throw errorSaneado(operacion, r.status);
}

const aceptaTodo = () => true;

export async function iniciarSubidaDriveReanudable(
  auth: JWT,
  params: Readonly<{
    fileId: string;
    nombre: string;
    carpetaId: string;
    mimeType: string;
    origenHash: string;
    tamanoTotal: bigint | null;
  }>
): Promise<string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=UTF-8",
    "X-Upload-Content-Type": params.mimeType
  };
  if (params.tamanoTotal !== null) headers["X-Upload-Content-Length"] = params.tamanoTotal.toString();
  // POST no idempotente: sin reintentos automáticos. El ID pregenerado permite reconciliar.
  const r = await auth.request<unknown>({
    url: `${DRIVE_UPLOAD_API_BASE_URL}/files?uploadType=resumable&supportsAllDrives=true&fields=id`,
    method: "POST",
    headers,
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: aceptaTodo,
    data: {
      id: params.fileId,
      name: params.nombre,
      parents: [params.carpetaId],
      mimeType: params.mimeType,
      appProperties: { [DRIVE_ZOOM_ORIGEN_PROPERTY]: params.origenHash }
    }
  }) as unknown as RespuestaHttp;
  if (r.status !== 200) throw errorSaneado("inicio de sesión", r.status);
  const location = r.headers?.location ?? r.headers?.Location;
  if (typeof location !== "string" || !location.startsWith("https://")) {
    throw new Error("Drive reanudable: no devolvió la sesión de subida.");
  }
  return location;
}

export async function consultarSubidaDriveReanudable(
  auth: JWT,
  sesionUrl: string,
  tamanoTotal: bigint | null,
  opciones: Readonly<{ signal?: AbortSignal }> = {}
): Promise<ResultadoSubidaDrive> {
  const r = await auth.request<unknown>({
    url: sesionUrl,
    method: "PUT",
    headers: { "Content-Range": `bytes */${tamanoTotal === null ? "*" : tamanoTotal.toString()}`, "Content-Length": "0" },
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: aceptaTodo,
    signal: opciones.signal
  }) as unknown as RespuestaHttp;
  return interpretar("consulta de sesión", r);
}

export async function subirBloqueDriveReanudable(
  auth: JWT,
  sesionUrl: string,
  offset: bigint,
  bytes: Uint8Array,
  tamanoTotal: bigint | null,
  opciones: Readonly<{ ultimo?: boolean; signal?: AbortSignal }> = {}
): Promise<ResultadoSubidaDrive> {
  const ultimo = opciones.ultimo === true;
  if (!ultimo && bytes.byteLength % DRIVE_BLOQUE_MULTIPLO_BYTES !== 0) {
    throw new Error("Drive reanudable: un bloque intermedio debe ser múltiplo de 256 KiB.");
  }
  const fin = offset + BigInt(bytes.byteLength);
  const total = ultimo ? fin : tamanoTotal;
  const totalTexto = total === null ? "*" : total.toString();
  const rango = bytes.byteLength === 0 ? `bytes */${totalTexto}` : `bytes ${offset}-${fin - 1n}/${totalTexto}`;
  const r = await auth.request<unknown>({
    url: sesionUrl,
    method: "PUT",
    headers: { "Content-Range": rango, "Content-Length": String(bytes.byteLength) },
    data: bytes,
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: aceptaTodo,
    signal: opciones.signal
  }) as unknown as RespuestaHttp;
  return interpretar("subida de bloque", r);
}

/** Consulta de metadatos por ID: primera vía de reconciliación, antes de listar por propiedad. */
export async function obtenerArchivoDrivePorId(
  auth: JWT,
  fileId: string,
  opciones: Readonly<{ signal?: AbortSignal }> = {}
): Promise<(ArchivoDriveSubido & { appProperties?: Record<string, string>; trashed?: boolean }) | null> {
  const r = await auth.request<unknown>({
    url: `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,appProperties,trashed&supportsAllDrives=true`,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: aceptaTodo,
    signal: opciones.signal
  }) as unknown as RespuestaHttp;
  if (r.status === 404) return null;
  if (r.status !== 200) throw errorSaneado("consulta de archivo", r.status);
  return r.data as ArchivoDriveSubido & { appProperties?: Record<string, string>; trashed?: boolean };
}

/** Segunda vía de reconciliación: archivos marcados con la identidad estable del recurso Zoom. */
export async function listarArchivosDrivePorOrigen(
  auth: JWT,
  origenHash: string,
  opciones: Readonly<{ signal?: AbortSignal }> = {}
): Promise<readonly ArchivoDriveSubido[]> {
  if (!/^[a-f0-9]{64}$/.test(origenHash)) throw new Error("Identificador de origen Drive inválido.");
  const query = `appProperties has { key='${DRIVE_ZOOM_ORIGEN_PROPERTY}' and value='${origenHash}' } and trashed = false`;
  const r = await auth.request<unknown>({
    url: `${DRIVE_API_BASE_URL}/files?q=${encodeURIComponent(query)}&fields=files(id,name,mimeType,size,webViewLink)&pageSize=3&includeItemsFromAllDrives=true&supportsAllDrives=true`,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: aceptaTodo,
    signal: opciones.signal
  }) as unknown as RespuestaHttp;
  if (r.status !== 200) throw errorSaneado("búsqueda por origen", r.status);
  return ((r.data as { files?: ArchivoDriveSubido[] })?.files) ?? [];
}

/** IDs pregenerados por Drive: permiten persistir el destino antes del POST y reconciliar por ID. */
export async function generarIdArchivoDrive(auth: JWT): Promise<string> {
  const r = await auth.request<unknown>({
    url: `${DRIVE_API_BASE_URL}/files/generateIds?count=1&space=drive`,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: aceptaTodo
  }) as unknown as RespuestaHttp;
  const id = (r.data as { ids?: string[] } | undefined)?.ids?.[0];
  if (r.status !== 200 || !id) throw errorSaneado("generación de ID", r.status);
  return id;
}

/** Healthcheck de escritura: la carpeta existe, es carpeta y la identidad de servicio puede crear dentro. */
export async function verificarEscrituraCarpetaDrive(auth: JWT, carpetaId: string): Promise<boolean> {
  const r = await auth.request<unknown>({
    url: `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(carpetaId)}?fields=id,mimeType,capabilities(canAddChildren)&supportsAllDrives=true`,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: aceptaTodo
  }) as unknown as RespuestaHttp;
  if (r.status === 404) return false;
  if (r.status !== 200) throw errorSaneado("comprobación de carpeta", r.status);
  const datos = r.data as { mimeType?: string; capabilities?: { canAddChildren?: boolean } } | undefined;
  return datos?.mimeType === DRIVE_FOLDER_MIME && datos.capabilities?.canAddChildren === true;
}
