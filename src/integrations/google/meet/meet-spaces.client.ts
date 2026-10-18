import type { JWT } from "google-auth-library";
import { GOOGLE_HTTP_TIMEOUT_MS, GOOGLE_HTTP_READ_TIMEOUT_MS } from "../auth";
import { conReintentosGoogleLectura } from "../retry";

export const MEET_API_BASE_URL = "https://meet.googleapis.com/v2";

export type GoogleMeetSpaceConfig = Readonly<{
  accessType?: "ACCESS_TYPE_UNSPECIFIED" | "OPEN" | "TRUSTED" | "RESTRICTED" | string;
  entryPointAccess?: "ENTRY_POINT_ACCESS_UNSPECIFIED" | "ALL" | "CREATOR_APP_ONLY" | string;
  moderation?: "MODERATION_UNSPECIFIED" | "OFF" | "ON" | string;
  attendanceReportGenerationType?:
    | "ATTENDANCE_REPORT_GENERATION_TYPE_UNSPECIFIED"
    | "DO_NOT_GENERATE"
    | "GENERATE_REPORT"
    | string;
  [key: string]: unknown;
}>;

export type GoogleMeetSpace = Readonly<{
  name?: string;
  meetingUri?: string;
  meetingCode?: string;
  config?: GoogleMeetSpaceConfig;
  [key: string]: unknown;
}>;

export type GoogleMeetSpaceMember = Readonly<{
  name?: string;
  email?: string;
  role?: "ROLE_UNSPECIFIED" | "COHOST" | "CONTRIBUTOR" | string;
  [key: string]: unknown;
}>;

export async function obtenerEspacioMeet(
  auth: JWT,
  spaceNameOrCode: string
): Promise<GoogleMeetSpace> {
  const path = spaceNameOrCode.startsWith("spaces/")
    ? spaceNameOrCode
    : `spaces/${encodeURIComponent(spaceNameOrCode)}`;
  const url = `${MEET_API_BASE_URL}/${path}`;
  const response = await conReintentosGoogleLectura(() => auth.request<GoogleMeetSpace>({
    url,
    method: "GET",
    timeout: GOOGLE_HTTP_READ_TIMEOUT_MS,
  }));
  return response.data;
}

export async function crearEspacioMeetHttp(
  auth: JWT,
  config?: GoogleMeetSpaceConfig
): Promise<GoogleMeetSpace> {
  const response = await auth.request<GoogleMeetSpace>({
    url: `${MEET_API_BASE_URL}/spaces`,
    method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: config ? { config } : {},
  });
  return response.data;
}

export async function actualizarEspacioMeetHttp(
  auth: JWT,
  spaceName: string,
  config: GoogleMeetSpaceConfig,
  updateMask: readonly string[]
): Promise<GoogleMeetSpace> {
  const url = `${MEET_API_BASE_URL}/${spaceName}?updateMask=${encodeURIComponent(updateMask.join(","))}`;
  const response = await auth.request<GoogleMeetSpace>({
    url,
    method: "PATCH",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: { name: spaceName, config },
  });
  return response.data;
}

export async function listarMiembrosMeetHttp(
  auth: JWT,
  spaceName: string
): Promise<readonly GoogleMeetSpaceMember[]> {
  const members: GoogleMeetSpaceMember[] = [];
  let pageToken: string | undefined;
  const seenTokens = new Set<string>();
  let pages = 0;

  do {
    if (++pages > 100) throw new Error("Google Meet superó el límite de paginación de miembros.");
    const query = new URLSearchParams({ pageSize: "100" });
    if (pageToken) query.set("pageToken", pageToken);

    const response = await conReintentosGoogleLectura(() => auth.request<{
      members?: readonly GoogleMeetSpaceMember[];
      nextPageToken?: string;
    }>({
      url: `${MEET_API_BASE_URL}/${spaceName}/members?${query.toString()}`,
      method: "GET",
      timeout: GOOGLE_HTTP_READ_TIMEOUT_MS,
    }));

    if (response.data.members) {
      members.push(...response.data.members);
    }
    pageToken = response.data.nextPageToken || undefined;
    if (pageToken && seenTokens.has(pageToken)) {
      throw new Error("Google Meet repitió un token de paginación de miembros.");
    }
    if (pageToken) seenTokens.add(pageToken);
  } while (pageToken);

  return members;
}

export async function crearMiembroMeetHttp(
  auth: JWT,
  spaceName: string,
  email: string,
  role: "COHOST" | "CONTRIBUTOR" | string
): Promise<GoogleMeetSpaceMember> {
  const response = await auth.request<GoogleMeetSpaceMember>({
    url: `${MEET_API_BASE_URL}/${spaceName}/members`,
    method: "POST",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: { email, role },
  });
  return response.data;
}

/** Promote an existing invited member without deleting their membership. */
export async function actualizarRolMiembroMeetHttp(
  auth: JWT,
  memberName: string,
  role: "COHOST" | "ROLE_UNSPECIFIED"
): Promise<GoogleMeetSpaceMember> {
  const response = await auth.request<GoogleMeetSpaceMember>({
    url: `${MEET_API_BASE_URL}/${memberName}?updateMask=role`,
    method: "PATCH",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
    data: { name: memberName, role },
  });
  return response.data;
}

export async function eliminarMiembroMeetHttp(
  auth: JWT,
  memberName: string
): Promise<void> {
  await auth.request({
    url: `${MEET_API_BASE_URL}/${memberName}`,
    method: "DELETE",
    timeout: GOOGLE_HTTP_TIMEOUT_MS,
  });
}

export function isAlreadyCohostError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  if (candidate.code === 409 || candidate.response?.status === 409) return true;
  return JSON.stringify(candidate.response?.data ?? "").includes("ALREADY_EXISTS");
}

export function isMeetNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    response?: { status?: unknown };
  };
  return candidate.code === 404 || candidate.response?.status === 404;
}

export function isMemberPermissionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  const status = candidate.response?.status ?? candidate.code;
  const text = [
    typeof candidate.message === "string" ? candidate.message : "",
    JSON.stringify(candidate.response?.data ?? ""),
  ].join(" ").toLowerCase();

  // Si el error indica explícitamente que la denegación fue sobre el recurso Space,
  // no se trata de un error de miembro.
  if (text.includes("resource space") || text.includes("recurso space")) {
    return false;
  }

  const hasPermissionStatus =
    status === 403 ||
    text.includes("permission denied") ||
    text.includes("permission_denied") ||
    text.includes("no tenés permisos") ||
    text.includes("no tienes permisos") ||
    text.includes("no tenes permisos") ||
    text.includes("caller does not have permission");

  if (!hasPermissionStatus) return false;

  const isMemberContext =
    text.includes("resource member") ||
    text.includes("rol de este miembro") ||
    text.includes("role of this member") ||
    text.includes("caller does not have permission") ||
    text.includes("insufficient authentication scopes") ||
    (text.includes("miembro") && (text.includes("permiso") || text.includes("rol"))) ||
    (text.includes("member") && text.includes("role")) ||
    text.includes("member") ||
    text.includes("miembro");

  return isMemberContext;
}



