import type { JWT } from "google-auth-library";
import { GOOGLE_HTTP_TIMEOUT_MS } from "../auth";
import { conReintentosGoogleLectura } from "../retry";

export const DRIVE_API_BASE_URL = "https://www.googleapis.com/drive/v3";
export const DRIVE_UPLOAD_API_BASE_URL = "https://www.googleapis.com/upload/drive/v3";
export const DRIVE_FOLDER_MIME = "application/vnd.google-apps.folder";
export const DRIVE_GOOGLE_DOC_MIME = "application/vnd.google-apps.document";

export type MovedDriveFile = Readonly<{
  id: string;
  name: string;
  mimeType?: string;
  size?: string;
  webViewLink?: string;
}>;

export async function obtenerOCrearCarpetaDrive(
  auth: JWT,
  parentId: string,
  name: string
): Promise<string> {
  const escaped = name.replaceAll("'", "\\'");
  const query = `mimeType = '${DRIVE_FOLDER_MIME}' and name = '${escaped}' and '${parentId}' in parents and trashed = false`;
  const url = `${DRIVE_API_BASE_URL}/files?q=${encodeURIComponent(query)}&fields=files(id)&pageSize=1&includeItemsFromAllDrives=true&supportsAllDrives=true`;

  const listed = await conReintentosGoogleLectura(() => auth.request<{ files?: readonly { id: string }[] }>({
    url,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  }));

  if (listed.data.files?.[0]?.id) {
    return listed.data.files[0].id;
  }

  const created = await auth.request<{ id?: string }>({
    url: `${DRIVE_API_BASE_URL}/files?fields=id&supportsAllDrives=true`,
    method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: { name, mimeType: DRIVE_FOLDER_MIME, parents: [parentId] },
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
  name: string
): Promise<MovedDriveFile> {
  const current = await conReintentosGoogleLectura(() => auth.request<MovedDriveFile & Readonly<{ parents?: readonly string[] }>>({
    url: `${DRIVE_API_BASE_URL}/files/${encodeURIComponent(fileId)}?fields=id,name,mimeType,size,webViewLink,parents&supportsAllDrives=true`,
    method: "GET",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  }));

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
  html: string
): Promise<MovedDriveFile> {
  const boundary = "gestor_flacso_meet_boundary";
  const metadata = JSON.stringify({
    name,
    mimeType: DRIVE_GOOGLE_DOC_MIME,
    parents: [folderId],
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

