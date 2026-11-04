export type ZoomCredentials = Readonly<{
  accountId: string;
  clientId: string;
  clientSecret: string;
}>;

export type ZoomCreateMeetingInput = Readonly<{
  topic: string;
  startTime: Date;
  durationMinutes: number;
  timezone: string;
  agenda?: string | null;
  requiereGrabacion?: boolean;
}>;

export type ZoomUpdateMeetingInput = Readonly<{
  topic?: string;
  startTime?: Date;
  durationMinutes?: number;
  timezone?: string;
  agenda?: string | null;
}>;

export type ZoomMeetingResult = Readonly<{
  meetingId: string;
  joinUrl: string;
  startUrl?: string;
  password?: string;
}>;

type TokenCacheEntry = {
  accessToken: string;
  expiresAt: number;
};

const tokenCache = new Map<string, TokenCacheEntry>();

export async function obtenerZoomAccessToken(creds: ZoomCredentials): Promise<string> {
  const cacheKey = `${creds.accountId}:${creds.clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }

  const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const url = `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${encodeURIComponent(creds.accountId)}`;

  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded"
    }
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Error al autenticar con Zoom API (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  const expiresAt = Date.now() + Math.max(60, data.expires_in - 300) * 1000;
  tokenCache.set(cacheKey, { accessToken: data.access_token, expiresAt });

  return data.access_token;
}

export async function crearReunionZoomHttp(
  token: string,
  userEmail: string,
  input: ZoomCreateMeetingInput
): Promise<ZoomMeetingResult> {
  const url = `https://api.zoom.us/v2/users/${encodeURIComponent(userEmail)}/meetings`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      topic: input.topic,
      type: 2, // Scheduled meeting
      start_time: input.startTime.toISOString(),
      duration: Math.max(1, input.durationMinutes),
      timezone: input.timezone,
      agenda: input.agenda ?? undefined,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        waiting_room: true,
        mute_upon_entry: true,
        auto_recording: input.requiereGrabacion ? "cloud" : "none",
        approval_type: 2 // 2 = sin registro; 0 sería "aprobar automáticamente" tras registrarse
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Zoom API error al crear reunión (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = (await response.json()) as {
    id: number | string;
    join_url: string;
    start_url?: string;
    password?: string;
  };

  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password
  };
}

export async function actualizarReunionZoomHttp(
  token: string,
  meetingId: string,
  input: ZoomUpdateMeetingInput
): Promise<void> {
  const url = `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`;
  const body: Record<string, unknown> = {};
  if (input.topic) body.topic = input.topic;
  if (input.startTime) body.start_time = input.startTime.toISOString();
  if (input.durationMinutes) body.duration = Math.max(1, input.durationMinutes);
  if (input.timezone) body.timezone = input.timezone;
  if (input.agenda !== undefined) body.agenda = input.agenda ?? "";

  const response = await fetch(url, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(body)
  });

  if (!response.ok && response.status !== 204) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Zoom API error al actualizar reunión (${response.status}): ${errorBody || response.statusText}`);
  }
}

export async function obtenerReunionZoomHttp(
  token: string,
  meetingId: string,
): Promise<ZoomMeetingResult> {
  const url = `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Zoom API error al obtener reunión (${response.status}): ${errorBody || response.statusText}`);
  }
  const data = (await response.json()) as {
    id: string | number;
    join_url?: string;
    start_url?: string;
    password?: string;
  };
  if (!data.join_url) throw new Error("Zoom no devolvió el enlace de acceso de la reunión.");
  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password,
  };
}

export async function eliminarReunionZoomHttp(
  token: string,
  meetingId: string
): Promise<void> {
  const url = `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Zoom API error al eliminar reunión (${response.status}): ${errorBody || response.statusText}`);
  }
}

export type ZoomCreateRecurringMeetingInput = Readonly<{
  topic: string;
  /** Lleva la marca `[serie:<clave>]` para reconocer la reunión si queda huérfana. */
  agenda?: string | null;
  requiereGrabacion?: boolean;
}>;

/**
 * Crea una reunión recurrente sin horario fijo (`type: 3`): un `join_url` estable que
 * todos los encuentros de una serie comparten. No lleva `start_time` ni `recurrence`.
 * El cuerpo exacto debe confirmarse contra la documentación de Zoom y una prueba real.
 */
export async function crearReunionZoomRecurrenteHttp(
  token: string,
  userEmail: string,
  input: ZoomCreateRecurringMeetingInput
): Promise<ZoomMeetingResult> {
  const url = `https://api.zoom.us/v2/users/${encodeURIComponent(userEmail)}/meetings`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      topic: input.topic,
      type: 3, // Recurrente sin horario fijo
      agenda: input.agenda ?? undefined,
      settings: {
        host_video: true,
        participant_video: true,
        join_before_host: false,
        waiting_room: true,
        mute_upon_entry: true,
        auto_recording: input.requiereGrabacion ? "cloud" : "none",
        approval_type: 2
      }
    })
  });

  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(`Zoom API error al crear reunión recurrente (${response.status}): ${errorBody || response.statusText}`);
  }

  const data = (await response.json()) as {
    id: number | string;
    join_url?: string;
    start_url?: string;
    password?: string;
  };
  if (!data.join_url) throw new Error("Zoom no devolvió el enlace de acceso de la reunión recurrente.");

  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password
  };
}

/**
 * Busca entre las reuniones del anfitrión la que lleve `marca` en su agenda. Sirve para
 * recuperar una reunión creada por un reclamo que murió antes de guardar su ID.
 */
export async function buscarReunionZoomPorMarcaHttp(
  token: string,
  userEmail: string,
  marca: string
): Promise<ZoomMeetingResult | null> {
  const base = `https://api.zoom.us/v2/users/${encodeURIComponent(userEmail)}/meetings?type=scheduled&page_size=300`;
  const buscarPagina = async (paginaToken: string | null): Promise<ZoomMeetingResult | null> => {
    const url = paginaToken ? `${base}&next_page_token=${encodeURIComponent(paginaToken)}` : base;
    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!response.ok) {
      const errorBody = await response.text().catch(() => "");
      throw new Error(`Zoom API error al listar reuniones (${response.status}): ${errorBody || response.statusText}`);
    }
    const data = (await response.json()) as {
      meetings?: readonly { id: number | string; join_url?: string; agenda?: string }[];
      next_page_token?: string;
    };
    const encontrada = (data.meetings ?? []).find(({ agenda, join_url }) => join_url && agenda?.includes(marca));
    if (encontrada?.join_url) return { meetingId: String(encontrada.id), joinUrl: encontrada.join_url };
    return data.next_page_token ? buscarPagina(data.next_page_token) : null;
  };
  return buscarPagina(null);
}
