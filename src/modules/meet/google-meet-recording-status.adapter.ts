import { JWT } from "google-auth-library";
import { conReintentosPorLimiteGoogle } from "./google-api-retry.adapter";

const MEET_SCOPE = "https://www.googleapis.com/auth/meetings.space.readonly";
const MEET_API = "https://meet.googleapis.com/v2";

export type EstadoGrabacionMeet = "AUSENTE" | "PROCESANDO" | "GENERADA";

export type RecordingStatusCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

type RecordingResource = Readonly<{
  state?: string;
  driveDestination?: Readonly<{ file?: string }>;
}>;

export async function obtenerEstadoGrabacionMeet(
  credentials: RecordingStatusCredentials,
  conferenceName: string
): Promise<EstadoGrabacionMeet> {
  const auth = new JWT({
    email: credentials.serviceAccountEmail,
    key: credentials.privateKey,
    scopes: [MEET_SCOPE],
    subject: credentials.subject
  });

  const recordings = await listarGrabaciones(auth, conferenceName);
  if (recordings.some(({ state, driveDestination }) =>
    state === "FILE_GENERATED" && Boolean(driveDestination?.file)
  )) {
    return "GENERADA";
  }
  if (recordings.length > 0) return "PROCESANDO";
  return "AUSENTE";
}

async function listarGrabaciones(auth: JWT, conferenceName: string): Promise<RecordingResource[]> {
  const recordings: RecordingResource[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams({ pageSize: "100" });
    if (pageToken) params.set("pageToken", pageToken);
    const response = await conReintentosPorLimiteGoogle(() => auth.request<{
      recordings?: RecordingResource[];
      nextPageToken?: string;
    }>({
      url: `${MEET_API}/${conferenceName}/recordings?${params.toString()}`,
      method: "GET"
    }));
    recordings.push(...(response.data.recordings ?? []));
    pageToken = response.data.nextPageToken;
  } while (pageToken);

  return recordings;
}
