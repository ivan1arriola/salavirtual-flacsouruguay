import type { JWT } from "google-auth-library";
import {
  conReintentosGoogleLectura,
  GOOGLE_HTTP_READ_TIMEOUT_MS,
  GOOGLE_HTTP_TIMEOUT_MS
} from "@/src/integrations/google";

const DRIVE = "https://www.googleapis.com/drive/v3/files";

type Permiso = Readonly<{ type?: string; role?: string; emailAddress?: string }>;

/** Da lectura solamente a la persona destinataria, sin exponer los archivos al público. */
export function crearCompartirArchivoZoom(auth: JWT): (fileId: string, email: string) => Promise<void> {
  return async (fileId, email) => {
    const id = encodeURIComponent(fileId);
    const normalizado = email.trim().toLowerCase();
    if (!fileId || !normalizado) {
      throw new Error("Falta archivo o destinatario.");
    }

    async function tienePermiso(): Promise<boolean> {
      let pageToken: string | undefined;
      const vistos = new Set<string>();
      do {
        const params = new URLSearchParams({
          supportsAllDrives: "true",
          fields: "nextPageToken,permissions(type,role,emailAddress)",
          pageSize: "100"
        });
        if (pageToken) {
          params.set("pageToken", pageToken);
        }
        const response = await conReintentosGoogleLectura(() =>
          auth.request<{ permissions?: Permiso[]; nextPageToken?: string }>({
            url: `${DRIVE}/${id}/permissions?${params}`,
            method: "GET",
            timeout: GOOGLE_HTTP_READ_TIMEOUT_MS
          })
        );
        if (
          response.data.permissions?.some(
            (p) =>
              p.type === "user" &&
              p.emailAddress?.toLowerCase() === normalizado &&
              ["reader", "commenter", "writer", "owner", "organizer", "fileOrganizer"].includes(p.role ?? "")
          )
        ) {
          return true;
        }
        pageToken = response.data.nextPageToken;
        if (pageToken && vistos.has(pageToken)) {
          throw new Error("Drive repitió el cursor de permisos.");
        }
        if (pageToken) {
          vistos.add(pageToken);
        }
      } while (pageToken);
      return false;
    }

    if (await tienePermiso()) {
      return;
    }
    try {
      await auth.request({
        url: `${DRIVE}/${id}/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id`,
        method: "POST",
        timeout: GOOGLE_HTTP_TIMEOUT_MS,
        data: { type: "user", role: "reader", emailAddress: normalizado }
      });
    } catch (error) {
      const candidate = error as { code?: number; response?: { status?: number } };
      if ((candidate.response?.status ?? candidate.code) !== 409) {
        throw error;
      }
      if (!(await tienePermiso())) {
        throw error;
      }
    }
  };
}
