import { JWT } from "google-auth-library";

const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.events";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.metadata.readonly";
const CALENDAR_API = "https://www.googleapis.com/calendar/v3";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_FOLDER_MIME_TYPE = "application/vnd.google-apps.folder";

type ServiceAccountCredential = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
}>;

type DelegatedCredential = ServiceAccountCredential &
  Readonly<{ subject: string }>;

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
  const auth = crearJwt(credential, CALENDAR_SCOPE);
  const calendarId = encodeURIComponent(credential.subject);
  await auth.request({
    url: `${CALENDAR_API}/calendars/${calendarId}/events?maxResults=1&singleEvents=true`,
    method: "GET"
  });
  return `Delegación válida para ${credential.subject}.`;
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
  return `Carpeta accesible: ${response.data.name ?? response.data.id ?? folderId}.`;
}

function crearJwt(
  credential: ServiceAccountCredential & Readonly<{ subject?: string }>,
  scope: string
): JWT {
  return new JWT({
    email: credential.serviceAccountEmail,
    key: credential.privateKey,
    scopes: [scope],
    subject: credential.subject
  });
}
