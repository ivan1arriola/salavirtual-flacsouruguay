import { JWT } from "google-auth-library";

const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const DRIVE_API = "https://www.googleapis.com/drive/v3";

export type GoogleDriveMediaCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export async function transmitirArchivoDrive(
  credentials: GoogleDriveMediaCredentials,
  fileId: string,
  range: string | null
): Promise<Response> {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [DRIVE_SCOPE],
    subject: credentials.subject
  });
  const token = extraerAccessToken(await auth.getAccessToken());

  const upstream = await fetch(
    `${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`,
    {
      headers: {
        Authorization: `Bearer ${token}`,
        ...(range ? { Range: range } : {})
      }
    }
  );
  if (!upstream.ok && upstream.status !== 206) {
    throw new Error(`Drive no pudo entregar la grabación (HTTP ${upstream.status}).`);
  }

  const headers = new Headers({
    "Accept-Ranges": upstream.headers.get("accept-ranges") ?? "bytes",
    "Cache-Control": "private, no-store",
    "Content-Type": upstream.headers.get("content-type") ?? "video/mp4"
  });
  for (const name of ["content-length", "content-range", "etag", "last-modified"]) {
    const value = upstream.headers.get(name);
    if (value) headers.set(name, value);
  }
  return new Response(upstream.body, { status: upstream.status, headers });
}

export function extraerAccessToken(value: unknown): string {
  const token = typeof value === "string"
    ? value
    : value && typeof value === "object" && "token" in value
      ? (value as { token?: unknown }).token
      : null;
  if (typeof token !== "string" || token.length === 0) {
    throw new Error("Google no devolvió un token para reproducir la grabación.");
  }
  return token;
}
