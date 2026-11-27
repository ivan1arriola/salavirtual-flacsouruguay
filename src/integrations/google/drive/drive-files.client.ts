import type { JWT } from "google-auth-library";
import { GOOGLE_HTTP_TIMEOUT_MS, GOOGLE_HTTP_READ_TIMEOUT_MS } from "../auth";
import { conReintentosGoogleLectura } from "../retry";

export const DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API_BASE_URL = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_GOOGLE_DOC_MIME = "application/vnd.google-apps.document";
export const DRIVE_OPERATION_PROPERTY = "flacsoOperationId";

export type MovedDriveFile = Readonly<{
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
}>;

export async function buscarCarpetaDrive(
  auth: JWT,
  parentId: string,
  name: string,
  requireUnique = false,
): Promise<string | null> {
  const escaped = name.replaceAll("'", "\\'");
  const query = `mimeType = '${DRIVE_FOLDER_MIME}' and name = '${escaped}' and '${parentId}' in parents and trashed = false`;
  const url = `${DRIVE_API_BASE_URL}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id)&pageSize=2&includeItemsFromAllDrives=true&supportsAllDrives=true`;

  const listed = await conReintentosGoogleLectura(() =>
    auth.request<{
      files?: readonly { id: string }[];
      nextPageToken?: string;
    }>({ url, method: "GET", timeout: GOOGLE_HTTP_READ_TIMEOUT_MS }),
  );
  // Ambiguous folder names are not proof of a successful CREATE.
  if (requireUnique && (listed.data.nextPageToken || listed.data.files?.length !== 1)) {
    return null;
  }
  return listed.data.files?.[0]?.id ?? null;
}

/**
 * A name alone is not proof that an uncertain POST completed. Search for the
 * immutable operation marker written in the same Google request as the object.
 * Return a result only if EXACTLY one matching remote file exists.
 */
export async function buscarRecursoDrivePorOperacion(
  auth: JWT,
  parentId: string,
  name: string,
  mimeType: string,
  operationId: string,
): Promise<MovedDriveFile | null> {
  if (!/^[a-f0-9]{64}$/.test(operationId)) {
    throw new Error("Identificador de operación Drive inválido.");
  }
  const escaped = (value: string) => value.replaceAll("\\", "\\\\").replaceAll("'", "\\'");
  const query = [
    `'${escaped(parentId)}' in parents`,
    `name = '${escaped(name)}'`,
    `mimeType = '${escaped(mimeType)}'`,
    "trashed = false",
    `appProperties has { key='${DRIVE_OPERATION_PROPERTY}' and value='${operationId}' }`,
  ].join(" and ");
  const url = `${DRIVE_API_BASE_URL}/files?q=${encodeURIComponent(query)}&fields=nextPageToken,files(id,name,mimeType,webViewLink,appProperties)&pageSize=2&includeItemsFromAllDrives=true&supportsAllDrives=true`;
  const response = await conReintentosGoogleLectura(() =>
    auth.request<{
      nextPageToken?: string;
      files?: readonly (MovedDriveFile & { appProperties?: Record<string, string> })[];
    }>({ url, method: "GET", timeout: GOOGLE_HTTP_READ_TIMEOUT_MS }),
  );
  if (response.data.nextPageToken || response.data.files?.length !== 1) {
    return null;
  }
  const item = response.data.files[0];
  if (
    !item?.id ||
    item.name !== name ||
    item.mimeType !== mimeType ||
    item.appProperties?.[DRIVE_OPERATION_PROPERTY] !== operationId
  ) {
    return null;
  }
  return { id: item.id, name: item.name, mimeType: item.mimeType, webViewLink: item.webViewLink };
}

export async function obtenerOCrearCarpetaDrive(
  auth: JWT,
  parentId: string,
  name: string,
  operationId?: string,
): Promise<string> {
  const existing = await buscarCarpetaDrive(auth, parentId, name);
  if (existing) {
    return existing;
  }

  const created = await auth.request<{ id?: string }>({
    url: `${DRIVE_API_BASE_URL}/files?fields=id&supportsAllDrives=true`,
    method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: {
      name,
      mimeType: DRIVE_FOLDER_MIME,
      parents: [parentId],
      ...(operationId ? { appProperties: { [DRIVE_OPERATION_PROPERTY]: operationId } } : {}),
    },
  });
  if (!created.data.id) {
    throw new Error("Drive no devolvió el ID de la carpeta creada.");
  }
  return created.data.id;
}

export async function moverArchivoDrive(
  auth: JWT,
  fileId: string,
  folderId: string,
  name: string,
): Promise<MovedDriveFile> {
  const current = await conReintentosGoogleLectura(() =>
    auth.request<MovedDriveFile & Readonly<{ parents?: readonly string[] }>>({
      url: `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,parents&supportsAllDrives=true`,
      method: "GET",
      timeout: GOOGLE_HTTP_READ_TIMEOUT_MS,
    }),
  );

  const removeParents = (current.data.parents ?? []).filter((id) => id !== folderId).join(",");
  const params = new URLSearchParams({
    addParents: folderId,
    fields: "id,name,mimeType,size,webViewLink",
    supportsAllDrives: "true",
  });
  if (removeParents) {
    params.set("removeParents", removeParents);
  }

  const moved = await auth.request<MovedDriveFile>({
    url: `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}?${params.toString()}`,
    method: "PATCH",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: { name },
  });

  return moved.data;
}

export async function subirDocumentoGoogleDrive(
  auth: JWT,
  folderId: string,
  name: string,
  html: string,
  operationId?: string,
): Promise<MovedDriveFile> {
  const boundary = "gestor_flacso_meet_boundary";
  const metadata = JSON.stringify({
    name,
    mimeType: DRIVE_GOOGLE_DOC_MIME,
    parents: [folderId],
    ...(operationId ? { appProperties: { [DRIVE_OPERATION_PROPERTY]: operationId } } : {}),
  });
  const body = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n--${boundary}\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n${html}\r\n--${boundary}--`;

  const response = await auth.request<MovedDriveFile>({
    url: `${DRIVE_UPLOAD_API_BASE_URL}/files?uploadType=multipart&fields=id,name,mimeType,size,webViewLink&supportsAllDrives=true`,
    method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    headers: { "Content-Type": `multipart/related; boundary=${boundary}` },
    data: body,
  });

  return response.data;
}

export type ResultadoMoverDrive = "MOVIDA" | "YA_EN_DESTINO" | "NO_ENCONTRADO";

/**
 * Mueve un archivo o carpeta de Drive al padre indicado SIN cambiar su ID (addParents/removeParents en
 * un solo PATCH). Idempotente: si ya está solo en el destino no escribe nada. Los archivos de una carpeta
 * movida van con ella, y heredan los permisos del nuevo contenedor.
 */
export async function moverElementoDriveACarpeta(
  auth: JWT,
  elementoId: string,
  nuevoPadreId: string,
  opciones: Readonly<{ signal?: AbortSignal }> = {},
): Promise<ResultadoMoverDrive> {
  const actual = await auth.request<{ id?: string; parents?: readonly string[] }>({
    url: `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(elementoId)}?fields=id,parents&supportsAllDrives=true`,
    method: "GET",
    timeout: GOOGLE_HTTP_READ_TIMEOUT_MS,
    validateStatus: () => true,
    signal: opciones.signal,
  });
  if (actual.status === 404) {
    return "NO_ENCONTRADO";
  }
  if (actual.status < 200 || actual.status >= 300) {
    throw new Error(`Drive rechazó consultar el elemento (HTTP ${actual.status}).`);
  }
  const padres = actual.data?.parents ?? [];
  if (padres.length === 1 && padres[0] === nuevoPadreId) {
    return "YA_EN_DESTINO";
  }

  const quitar = padres.filter((p) => p !== nuevoPadreId);
  const consulta = new URLSearchParams({ supportsAllDrives: "true", fields: "id,parents" });
  if (!padres.includes(nuevoPadreId)) {
    consulta.set("addParents", nuevoPadreId);
  }
  if (quitar.length > 0) {
    consulta.set("removeParents", quitar.join(","));
  }
  const movido = await auth.request({
    url: `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(elementoId)}?${consulta.toString()}`,
    method: "PATCH",
    data: {},
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    signal: opciones.signal,
  });
  if (movido.status < 200 || movido.status >= 300) {
    throw new Error(`Drive rechazó mover el elemento (HTTP ${movido.status}).`);
  }
  return "MOVIDA";
}

export type ResultadoRenombrarDrive = "RENOMBRADA" | "YA_NOMBRADA" | "NO_ENCONTRADO";

/** Cambia el nombre de un archivo o carpeta sin cambiar su ID. Idempotente: si ya tiene ese nombre no escribe. */
export async function renombrarElementoDrive(
  auth: JWT,
  elementoId: string,
  nombre: string,
  opciones: Readonly<{ signal?: AbortSignal }> = {},
): Promise<ResultadoRenombrarDrive> {
  const url = `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(elementoId)}?fields=id,name&supportsAllDrives=true`;
  const actual = await auth.request<{ id?: string; name?: string }>({
    url,
    method: "GET",
    timeout: GOOGLE_HTTP_READ_TIMEOUT_MS,
    validateStatus: () => true,
    signal: opciones.signal,
  });
  if (actual.status === 404) {
    return "NO_ENCONTRADO";
  }
  if (actual.status < 200 || actual.status >= 300) {
    throw new Error(`Drive rechazó consultar el elemento (HTTP ${actual.status}).`);
  }
  if (actual.data?.name === nombre) {
    return "YA_NOMBRADA";
  }
  const respuesta = await auth.request({
    url,
    method: "PATCH",
    data: { name: nombre },
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    validateStatus: () => true,
    signal: opciones.signal,
  });
  if (respuesta.status < 200 || respuesta.status >= 300) {
    throw new Error(`Drive rechazó renombrar el elemento (HTTP ${respuesta.status}).`);
  }
  return "RENOMBRADA";
}
