import { JWT } from "google-auth-library";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const MEET_SETTINGS_SCOPE = "https://www.googleapis.com/auth/meetings.space.settings";
const MEET_READ_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const GMAIL_SEND_SCOPE = "https://www.googleapis.com/auth/gmail.send";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type ServiceAccountCredential = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
}>;

type DelegatedCredential = ServiceAccountCredential &
  Readonly<{ subject: string }>;

const WRITER_ROLES = new Set(["organizer", "fileOrganizer", "writer"]);

export async function probarCredencialGoogle(
  credential: ServiceAccountCredential
): Promise<string> {
  const auth = crearJwt(credential, CALENDAR_SCOPE);
  await auth.authorize();
  return "Google aceptó la cuenta de servicio y la clave privada.";
}

export async function probarDelegacionGoogle(
  credential: DelegatedCredential
): Promise<string> {
  const auth = crearJwt(credential, [
    CALENDAR_SCOPE,
    DRIVE_SCOPE,
    MEET_SETTINGS_SCOPE,
    MEET_READ_SCOPE,
    GMAIL_SEND_SCOPE
  ]);
  const calendarId = encodeURIComponent(credential.subject);
  await auth.request({
    url: `${CALENDAR_API}/calendars/${calendarId}/events?maxResults=1&singleEvents=true`,
    method: "GET"
  });
  return `Delegación válida para ${credential.subject}: Calendar, Drive, Meet y Gmail autorizados.`;
}

export async function probarDestinoDrive(
  credential: DelegatedCredential,
  folderId: string
): Promise<string> {
  const auth = crearJwt(credential, DRIVE_SCOPE);
  const response = await auth.request<{
    id?: string;
    name?: string;
    mimeType?: string;
    trashed?: boolean;
  }>({
    url: `${DRIVE_API}/files/${encodeURIComponent(folderId)}?fields=id,name,mimeType,trashed&supportsAllDrives=true`,
    method: "GET"
  });
  if (response.data.mimeType !== DRIVE_FOLDER_MIME_TYPE || response.data.trashed) {
    throw new Error("El ID no corresponde a una carpeta de Drive disponible.");
  }
  const probe = await auth.request<{ id?: string }>({
    url: `${DRIVE_API}/files?fields=id&supportsAllDrives=true`,
    method: "POST",
    data: {
      name: `.prueba-gestor-meet-${Date.now()}`,
      mimeType: DRIVE_FOLDER_MIME_TYPE,
      parents: [folderId]
    }
  });
  if (!probe.data.id) throw new Error("Drive no confirmó la prueba de escritura.");
  await eliminarPrueba(auth, probe.data.id);
  return `Lectura y escritura confirmadas en ${response.data.name ?? response.data.id ?? folderId}.`;
}

export async function prepararAccesoSalasDrive(
  credential: DelegatedCredential,
  folderId: string,
  hostEmails: readonly string[]
): Promise<string> {
  const auth = crearJwt(credential, DRIVE_SCOPE);
  const response = await auth.request<{
    permissions?: readonly Readonly<{
      id: string;
      emailAddress?: string;
      role?: string;
    }>[];
  }>({
    url: `${DRIVE_API}/files/${encodeURIComponent(folderId)}/permissions?fields=permissions(id,emailAddress,role)&supportsAllDrives=true`,
    method: "GET"
  });
  const writable = new Set((response.data.permissions ?? []).flatMap((permission) =>
    permission.emailAddress && permission.role && WRITER_ROLES.has(permission.role)
      ? [permission.emailAddress.toLowerCase()]
      : []
  ));
  const pending = hostEmails.filter((email) => !writable.has(email.toLowerCase()));
  await pending.reduce<Promise<unknown>>(async (previous, emailAddress) => {
    await previous;
    return auth.request({
      url: `${DRIVE_API}/files/${encodeURIComponent(folderId)}/permissions?supportsAllDrives=true&sendNotificationEmail=false&fields=id`,
      method: "POST",
      data: { type: "user", role: "fileOrganizer", emailAddress }
    });
  }, Promise.resolve());
  return `${hostEmails.length - pending.length} salas ya tenían acceso; ${pending.length} fueron habilitadas con administración de contenido.`;
}

async function eliminarPrueba(auth: JWT, fileId: string): Promise<void> {
  try {
    await auth.request({
      url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      method: "DELETE"
    });
  } catch {
    await auth.request({
      url: `${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`,
      method: "PATCH",
      data: { trashed: true }
    });
  }
}

function crearJwt(
  credential: ServiceAccountCredential & Readonly<{ subject?: string }>,
  scope: string | readonly string[]
): JWT {
  return new JWT({
    email: credential.serviceAccountEmail,
    key: credential.privateKey,
    scopes: typeof scope === "string" ? [scope] : [...scope],
    subject: credential.subject
  });
}
