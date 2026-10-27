import { codificarUuidZoom, type ZoomClient } from "./zoom-api.client";

/** Reunión programada (type 2). */
export type ZoomMeeting = Readonly<{
  id: number;
  uuid?: string;
  host_email?: string;
  topic?: string;
  start_time?: string;
  duration?: number;
  timezone?: string;
  join_url: string;
  start_url?: string;
  password?: string;
  status?: "waiting" | "started" | "finished" | string;
  settings?: Readonly<{
    alternative_hosts?: string;
    auto_recording?: "local" | "cloud" | "none" | string;
    waiting_room?: boolean;
    join_before_host?: boolean;
  }>;
}>;

export type ZoomMeetingInput = Readonly<{
  topic: string;
  agenda?: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  alternativeHosts: readonly string[];
  grabarEnNube: boolean;
}>;

export type ZoomPastInstance = Readonly<{ uuid: string; start_time: string }>;

export type ZoomPastMeeting = Readonly<{
  uuid: string;
  id: number;
  host_email?: string;
  start_time: string;
  end_time?: string;
  duration?: number;
  participants_count?: number;
}>;

export type ZoomReportParticipant = Readonly<{
  id?: string;
  user_id?: string;
  participant_user_id?: string;
  registrant_id?: string;
  name: string;
  user_email?: string;
  join_time: string;
  leave_time: string;
  duration: number;
  status?: string;
}>;

export type ZoomRecordingFile = Readonly<{
  id: string;
  meeting_id?: string;
  recording_start?: string;
  recording_end?: string;
  file_type: string;
  file_extension?: string;
  file_size?: number;
  download_url: string;
  status?: "completed" | "processing" | string;
  recording_type?: string;
}>;

export type ZoomRecordings = Readonly<{
  uuid?: string;
  recording_files?: readonly ZoomRecordingFile[];
}>;

export type ZoomLiveParticipant = Readonly<{
  id?: string;
  user_id?: string;
  participant_user_id?: string;
  user_name: string;
  email?: string;
  join_time?: string;
  leave_time?: string;
  device?: string;
  role?: string;
}>;

export type ZoomUser = Readonly<{ id: string; email: string; type: number; status?: string }>;

const DURACION_MAXIMA_MIN = 24 * 60;

export function cuerpoReunionZoom(input: ZoomMeetingInput): Record<string, unknown> {
  const duracion = Math.max(1, Math.min(DURACION_MAXIMA_MIN, Math.round((input.fin.getTime() - input.inicio.getTime()) / 60_000)));
  return {
    topic: input.topic.slice(0, 200),
    ...(input.agenda ? { agenda: input.agenda.slice(0, 2000) } : {}),
    type: 2,
    // Zoom interpreta start_time con sufijo Z como UTC; timezone solo afecta la visualización.
    start_time: input.inicio.toISOString().replace(/\.\d{3}Z$/, "Z"),
    duration: duracion,
    timezone: input.timezone,
    settings: {
      alternative_hosts: input.alternativeHosts.join(";"),
      alternative_hosts_email_notification: true,
      auto_recording: input.grabarEnNube ? "cloud" : "none",
      join_before_host: false,
      waiting_room: false,
      mute_upon_entry: true,
    },
  };
}

export async function crearReunionZoom(
  client: ZoomClient,
  hostEmail: string,
  input: ZoomMeetingInput
): Promise<ZoomMeeting> {
  return client.post<ZoomMeeting>(`/users/${encodeURIComponent(hostEmail)}/meetings`, cuerpoReunionZoom(input));
}

export async function obtenerReunionZoom(client: ZoomClient, meetingId: string): Promise<ZoomMeeting> {
  return client.get<ZoomMeeting>(`/meetings/${encodeURIComponent(meetingId)}`);
}

export async function actualizarReunionZoom(
  client: ZoomClient,
  meetingId: string,
  input: ZoomMeetingInput
): Promise<void> {
  const { type: _type, ...body } = cuerpoReunionZoom(input);
  await client.patch(`/meetings/${encodeURIComponent(meetingId)}`, body);
}

export async function actualizarAlternativeHostsZoom(
  client: ZoomClient,
  meetingId: string,
  alternativeHosts: readonly string[]
): Promise<void> {
  await client.patch(`/meetings/${encodeURIComponent(meetingId)}`, {
    settings: {
      alternative_hosts: alternativeHosts.join(";"),
      alternative_hosts_email_notification: true,
    },
  });
}

export async function eliminarReunionZoom(client: ZoomClient, meetingId: string): Promise<void> {
  await client.delete(`/meetings/${encodeURIComponent(meetingId)}`, {
    schedule_for_reminder: "false",
    cancel_meeting_reminder: "true",
  });
}

/** Usuarios activos de la cuenta; solo ellos pueden ser alternative hosts. */
export async function listarUsuariosZoomActivos(client: ZoomClient): Promise<readonly ZoomUser[]> {
  return paginar<ZoomUser>(client, "/users", "users", { status: "active", page_size: 300 });
}

export async function listarInstanciasPasadasZoom(
  client: ZoomClient,
  meetingId: string
): Promise<readonly ZoomPastInstance[]> {
  const data = await client.get<{ meetings?: readonly ZoomPastInstance[] }>(
    `/past_meetings/${encodeURIComponent(meetingId)}/instances`
  );
  return data.meetings ?? [];
}

export async function obtenerReunionPasadaZoom(client: ZoomClient, uuid: string): Promise<ZoomPastMeeting> {
  return client.get<ZoomPastMeeting>(`/past_meetings/${codificarUuidZoom(uuid)}`);
}

export async function listarParticipantesReporteZoom(
  client: ZoomClient,
  uuid: string
): Promise<readonly ZoomReportParticipant[]> {
  return paginar<ZoomReportParticipant>(
    client,
    `/report/meetings/${codificarUuidZoom(uuid)}/participants`,
    "participants",
    { page_size: 300 }
  );
}

export async function obtenerGrabacionesZoom(client: ZoomClient, uuid: string): Promise<ZoomRecordings | null> {
  try {
    return await client.get<ZoomRecordings>(`/meetings/${codificarUuidZoom(uuid)}/recordings`);
  } catch (error) {
    // 3301: "This recording does not exist."
    if (error && typeof error === "object" && "status" in error && (error as { status: number }).status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Participantes en vivo (Dashboard API). Requiere plan Business o superior;
 * en cuentas Pro devuelve error y la consola cae al reporte post-reunión.
 */
export async function listarParticipantesEnVivoZoom(
  client: ZoomClient,
  meetingId: string
): Promise<readonly ZoomLiveParticipant[]> {
  return paginar<ZoomLiveParticipant>(
    client,
    `/metrics/meetings/${encodeURIComponent(meetingId)}/participants`,
    "participants",
    { type: "live", page_size: 300 }
  );
}

async function paginar<T>(
  client: ZoomClient,
  path: string,
  key: string,
  query: Readonly<Record<string, string | number>>
): Promise<readonly T[]> {
  const items: T[] = [];
  let nextPageToken: string | undefined;
  let paginas = 0;
  do {
    const data = await client.get<Record<string, unknown>>(path, { ...query, next_page_token: nextPageToken });
    const page = data[key];
    if (Array.isArray(page)) items.push(...(page as T[]));
    nextPageToken = typeof data.next_page_token === "string" && data.next_page_token ? data.next_page_token : undefined;
    paginas += 1;
  } while (nextPageToken && paginas < 100);
  return items;
}

export type ZoomLiveMeetingMetrics = Readonly<{
  uuid?: string;
  id?: number;
  start_time?: string;
  participants?: number;
  has_recording?: boolean;
}>;

/** Métricas de una reunión en curso (Dashboard API, plan Business o superior). */
export async function obtenerMetricasReunionEnVivoZoom(
  client: ZoomClient,
  meetingId: string
): Promise<ZoomLiveMeetingMetrics | null> {
  try {
    return await client.get<ZoomLiveMeetingMetrics>(`/metrics/meetings/${encodeURIComponent(meetingId)}`, { type: "live" });
  } catch {
    return null;
  }
}
