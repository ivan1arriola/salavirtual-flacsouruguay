import type { JWT } from "google-auth-library";
import {
  conReintentosGoogleLectura,
  GOOGLE_HTTP_TIMEOUT_MS,
  GOOGLE_HTTP_READ_TIMEOUT_MS
} from "@/src/integrations/google";

/**
 * Acceso mediante enlace, sin autenticación y de solo lectura.
 * Atención: la planilla contiene datos personales y cualquier persona que
 * reciba su URL podrá consultarlos, también fuera de FLACSO.
 */
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

type DrivePermission = Readonly<{
  id?: string;
  type?: string;
  domain?: string;
  role?: string;
  allowFileDiscovery?: boolean;
}>;

async function obtenerPermisoEnlace(auth: JWT, fileId: string): Promise<DrivePermission | null> {
  const permissions: DrivePermission[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      fields: "nextPageToken,permissions(id,type,domain,role,allowFileDiscovery)",
      pageSize: "100",
      supportsAllDrives: "true"
    });
    if (pageToken) {
      params.set("pageToken", pageToken);
    }
    const response = await conReintentosGoogleLectura(() =>
      auth.request<{
        permissions?: readonly DrivePermission[];
        nextPageToken?: string;
      }>({
        method: "GET",
        url: `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions?${params}`,
        timeout: GOOGLE_HTTP_READ_TIMEOUT_MS
      })
    );
    permissions.push(...(response.data.permissions ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
    if (pageToken && seen.has(pageToken)) {
      throw new Error("Google Drive repitió la paginación de permisos.");
    }
    if (pageToken) {
      seen.add(pageToken);
    }
  } while (pageToken);

  return permissions.find((item) => item.type === "anyone") ?? null;
}

/** Idempotente; verifica el permiso REAL antes de confirmar que la planilla es accesible. */
export async function asegurarLecturaPorEnlacePlanilla(auth: JWT, fileId: string): Promise<void> {
  if (!fileId.trim()) {
    throw new Error("La planilla no tiene un ID de Drive.");
  }
  let permission = await obtenerPermisoEnlace(auth, fileId);
  if (!permission) {
    try {
      await auth.request({
        method: "POST",
        url: `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id`,
        timeout: GOOGLE_HTTP_TIMEOUT_MS,
        data: { type: "anyone", role: "reader", allowFileDiscovery: false }
      });
    } catch (error) {
      const candidate = error as { code?: number; response?: { status?: number } };
      if ((candidate.response?.status ?? candidate.code) !== 409) {
        throw error;
      }
      // Otra operación pudo crear el permiso concurrentemente. La lectura
      // posterior debe comprobarlo; un 409 aislado no prueba la autorización.
    }
    permission = await obtenerPermisoEnlace(auth, fileId);
  }
  if (!permission) {
    throw new Error("Google Drive no confirmó el permiso 'Cualquier persona con el enlace'.");
  }
  // Un enlace ya público puede haber sido otorgado previamente con edición.
  // La política de Sala Virtual exige lectura y ningún descubrimiento público.
  if (permission.role !== "reader" || permission.allowFileDiscovery === true) {
    if (!permission.id) {
      throw new Error("Google Drive no devolvió el ID del permiso por enlace.");
    }
    await auth.request({
      method: "PATCH",
      url: `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permission.id)}?supportsAllDrives=true&fields=id`,
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
      data: { role: "reader", allowFileDiscovery: false }
    });
    permission = await obtenerPermisoEnlace(auth, fileId);
  }
  if (!permission || permission.role !== "reader" || permission.allowFileDiscovery === true) {
    throw new Error("Google Drive no confirmó acceso de solo lectura mediante enlace.");
  }
}
