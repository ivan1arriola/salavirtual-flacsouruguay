import type { JWT } from "google-auth-library";
import { conReintentosGoogleLectura, GOOGLE_HTTP_TIMEOUT_MS, GOOGLE_HTTP_READ_TIMEOUT_MS } from "@/src/integrations/google";

/**
 * Los reportes de asistencia contienen datos personales. El permiso de dominio
 * concede lectura solo a usuarios autenticados de FLACSO que reciban el enlace,
 * nunca acceso público ni edición.
 */
const FLACSO_DOMAIN = "flacso.edu.uy";
const DRIVE_FILES = "https://www.googleapis.com/drive/v3/files";

type DrivePermission = Readonly<{
  id?: string;
  type?: string;
  domain?: string;
  role?: string;
  allowFileDiscovery?: boolean;
}>;

const READER_ROLES = new Set(["reader", "commenter", "writer", "fileOrganizer", "organizer", "owner"]);

async function obtenerPermisoDominio(auth: JWT, fileId: string): Promise<DrivePermission | null> {
  const permissions: DrivePermission[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({
      fields: "nextPageToken,permissions(id,type,domain,role,allowFileDiscovery)",
      pageSize: "100",
      supportsAllDrives: "true",
    });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await conReintentosGoogleLectura(() => auth.request<{
      permissions?: readonly DrivePermission[];
      nextPageToken?: string;
    }>({
      method: "GET",
      url: `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions?${params}`,
      timeout: GOOGLE_HTTP_READ_TIMEOUT_MS,
    }));
    permissions.push(...(response.data.permissions ?? []));
    pageToken = response.data.nextPageToken ?? undefined;
    if (pageToken && seen.has(pageToken)) throw new Error("Google Drive repitió la paginación de permisos.");
    if (pageToken) seen.add(pageToken);
  } while (pageToken);

  return permissions.find(
    (item) => item.type === "domain" && item.domain?.toLowerCase() === FLACSO_DOMAIN
  ) ?? null;
}

/** Idempotente; verifica el permiso REAL antes de confirmar que la planilla es accesible. */
export async function asegurarLecturaInstitucionalPlanilla(auth: JWT, fileId: string): Promise<void> {
  if (!fileId.trim()) throw new Error("La planilla no tiene un ID de Drive.");
  let permission = await obtenerPermisoDominio(auth, fileId);
  if (!permission) {
    try {
      await auth.request({
        method: "POST",
        url: `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id`,
        timeout: GOOGLE_HTTP_TIMEOUT_MS,
        data: { type: "domain", domain: FLACSO_DOMAIN, role: "reader", allowFileDiscovery: false },
      });
    } catch (error) {
      const candidate = error as { code?: number; response?: { status?: number } };
      if ((candidate.response?.status ?? candidate.code) !== 409) throw error;
      // Otra operación pudo crear el permiso concurrentemente. La lectura
      // posterior debe comprobarlo; un 409 aislado no prueba la autorización.
    }
    permission = await obtenerPermisoDominio(auth, fileId);
  }
  if (!permission || !permission.role || !READER_ROLES.has(permission.role)) {
    throw new Error("Google Drive no confirmó acceso de lectura para el dominio de FLACSO.");
  }
  // Si se concedió acceso discoverable previamente, no eliminar otros permisos,
  // pero ocultar este archivo de búsquedas internas porque contiene datos de asistencia.
  if (permission.allowFileDiscovery === true) {
    if (!permission.id) throw new Error("Google Drive no devolvió el ID del permiso institucional.");
    await auth.request({
      method: "PATCH",
      url: `${DRIVE_FILES}/${encodeURIComponent(fileId)}/permissions/${encodeURIComponent(permission.id)}?supportsAllDrives=true&fields=id`,
      timeout: GOOGLE_HTTP_TIMEOUT_MS,
      data: { allowFileDiscovery: false },
    });
    const verified = await obtenerPermisoDominio(auth, fileId);
    if (!verified || verified.allowFileDiscovery !== false || !READER_ROLES.has(verified.role ?? "")) {
      throw new Error("Google Drive no confirmó los permisos institucionales de la planilla.");
    }
  }
}
