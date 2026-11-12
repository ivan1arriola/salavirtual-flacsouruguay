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

const renovacionesEnCurso = new Map<string, Promise<string>>();

function claveCache(creds: ZoomCredentials): string {
  return `${creds.accountId}:${creds.clientId}`;
}

async function solicitarNuevoToken(creds: ZoomCredentials): Promise<string> {
  const cacheKey = claveCache(creds);
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
    throw new Error(
      `Error al autenticar con Zoom API (${response.status}): ${errorBody || response.statusText}`
    );
  }

  const data = (await response.json()) as { access_token: string; expires_in: number };
  const expiresAt = Date.now() + Math.max(60, data.expires_in - 300) * 1000;
  tokenCache.set(cacheKey, { accessToken: data.access_token, expiresAt });

  return data.access_token;
}

/** Una sola solicitud OAuth en vuelo por cuenta: las llamadas concurrentes comparten el resultado. */
function renovarCompartido(creds: ZoomCredentials): Promise<string> {
  const cacheKey = claveCache(creds);
  const enCurso = renovacionesEnCurso.get(cacheKey);
  if (enCurso) {
    return enCurso;
  }
  const promesa = solicitarNuevoToken(creds).finally(() => renovacionesEnCurso.delete(cacheKey));
  renovacionesEnCurso.set(cacheKey, promesa);
  return promesa;
}

export async function obtenerZoomAccessToken(creds: ZoomCredentials): Promise<string> {
  const cached = tokenCache.get(claveCache(creds));
  if (cached && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  return renovarCompartido(creds);
}

/**
 * Descarta el token que Zoom rechazó (401) y entrega uno nuevo. Si otra solicitud ya lo renovó
 * mientras tanto, reutiliza ese token en vez de pedir otro: seguro ante concurrencia.
 */
export async function invalidarZoomAccessToken(
  creds: ZoomCredentials,
  tokenRechazado: string
): Promise<string> {
  const cacheKey = claveCache(creds);
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.accessToken !== tokenRechazado && cached.expiresAt > Date.now()) {
    return cached.accessToken;
  }
  if (cached && cached.accessToken === tokenRechazado) {
    tokenCache.delete(cacheKey);
  }
  return renovarCompartido(creds);
}

/** Origen de tokens para clientes que reintentan una sola vez ante un 401. */
export type ProveedorTokenZoom = Readonly<{
  obtener: () => Promise<string>;
  renovar: (tokenRechazado: string) => Promise<string>;
}>;

export function crearProveedorTokenZoom(creds: ZoomCredentials): ProveedorTokenZoom {
  return {
    obtener: () => obtenerZoomAccessToken(creds),
    renovar: (tokenRechazado) => invalidarZoomAccessToken(creds, tokenRechazado)
  };
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
    throw new Error(
      `Zoom API error al crear reunión (${response.status}): ${errorBody || response.statusText}`
    );
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
  if (input.topic) {
    body.topic = input.topic;
  }
  if (input.startTime) {
    body.start_time = input.startTime.toISOString();
  }
  if (input.durationMinutes) {
    body.duration = Math.max(1, input.durationMinutes);
  }
  if (input.timezone) {
    body.timezone = input.timezone;
  }
  if (input.agenda !== undefined) {
    body.agenda = input.agenda ?? "";
  }

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
    throw new Error(
      `Zoom API error al actualizar reunión (${response.status}): ${errorBody || response.statusText}`
    );
  }
}

export async function obtenerReunionZoomHttp(token: string, meetingId: string): Promise<ZoomMeetingResult> {
  const url = `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!response.ok) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Zoom API error al obtener reunión (${response.status}): ${errorBody || response.statusText}`
    );
  }
  const data = (await response.json()) as {
    id: string | number;
    join_url?: string;
    start_url?: string;
    password?: string;
  };
  if (!data.join_url) {
    throw new Error("Zoom no devolvió el enlace de acceso de la reunión.");
  }
  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password
  };
}

export async function eliminarReunionZoomHttp(token: string, meetingId: string): Promise<void> {
  const url = `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Zoom API error al eliminar reunión (${response.status}): ${errorBody || response.statusText}`
    );
  }
}

export type ZoomOccurrenceResult = Readonly<{
  occurrenceId: string;
  startTime: string;
  duration: number;
  status?: string;
}>;

export type ZoomMeetingWithOccurrencesResult = ZoomMeetingResult &
  Readonly<{
    occurrences?: readonly ZoomOccurrenceResult[];
  }>;

export type ZoomRecurrenceInput = Readonly<{
  type: 1 | 2 | 3;
  repeatInterval: number;
  weeklyDays?: string;
  endTimes?: number;
  endDateTime?: string;
}>;

export type ZoomCreateRecurringMeetingInput = Readonly<{
  topic: string;
  startTime: Date;
  durationMinutes: number;
  timezone: string;
  /** Lleva la marca `[serie:<clave>]` para reconocer la reunión si queda huérfana. */
  agenda?: string | null;
  requiereGrabacion?: boolean;
  recurrence: ZoomRecurrenceInput;
}>;

/**
 * Crea una reunión recurrente con horario fijo (`type: 8`): un `join_url` y `meetingId` estables
 * que todos los encuentros de una serie comparten, con ocurrencias registradas en el calendario de Zoom.
 */
export async function crearReunionZoomRecurrenteHttp(
  token: string,
  userEmail: string,
  input: ZoomCreateRecurringMeetingInput
): Promise<ZoomMeetingWithOccurrencesResult> {
  const url = `https://api.zoom.us/v2/users/${encodeURIComponent(userEmail)}/meetings`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      topic: input.topic,
      type: 8, // Recurrente con horario fijo
      start_time: input.startTime.toISOString(),
      duration: Math.max(1, input.durationMinutes),
      timezone: input.timezone,
      agenda: input.agenda ?? undefined,
      recurrence: {
        type: input.recurrence.type,
        repeat_interval: input.recurrence.repeatInterval,
        weekly_days: input.recurrence.weeklyDays,
        end_times: input.recurrence.endTimes,
        end_date_time: input.recurrence.endDateTime
      },
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
    throw new Error(
      `Zoom API error al crear reunión recurrente (${response.status}): ${errorBody || response.statusText}`
    );
  }

  const data = (await response.json()) as {
    id: number | string;
    join_url?: string;
    start_url?: string;
    password?: string;
    occurrences?: readonly {
      occurrence_id: string | number;
      start_time: string;
      duration: number;
      status?: string;
    }[];
  };
  if (!data.join_url) {
    throw new Error("Zoom no devolvió el enlace de acceso de la reunión recurrente.");
  }

  const occurrences: readonly ZoomOccurrenceResult[] | undefined = data.occurrences?.map((occ) => ({
    occurrenceId: String(occ.occurrence_id),
    startTime: occ.start_time,
    duration: occ.duration,
    status: occ.status
  }));

  return {
    meetingId: String(data.id),
    joinUrl: data.join_url,
    startUrl: data.start_url,
    password: data.password,
    ...(occurrences ? { occurrences } : {})
  };
}

export async function eliminarOcurrenciaZoomHttp(
  token: string,
  meetingId: string,
  occurrenceId: string
): Promise<void> {
  const url = `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}?occurrence_id=${encodeURIComponent(occurrenceId)}`;
  const response = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok && response.status !== 204 && response.status !== 404) {
    const errorBody = await response.text().catch(() => "");
    throw new Error(
      `Zoom API error al eliminar ocurrencia (${response.status}): ${errorBody || response.statusText}`
    );
  }
}

export async function actualizarOcurrenciaZoomHttp(
  token: string,
  meetingId: string,
  occurrenceId: string,
  input: Readonly<{ startTime?: Date; durationMinutes?: number }>
): Promise<void> {
  const url = `https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}?occurrence_id=${encodeURIComponent(occurrenceId)}`;
  const body: Record<string, unknown> = {};
  if (input.startTime) {
    body.start_time = input.startTime.toISOString();
  }
  if (input.durationMinutes) {
    body.duration = Math.max(1, input.durationMinutes);
  }

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
    throw new Error(
      `Zoom API error al actualizar ocurrencia (${response.status}): ${errorBody || response.statusText}`
    );
  }
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
      throw new Error(
        `Zoom API error al listar reuniones (${response.status}): ${errorBody || response.statusText}`
      );
    }
    const data = (await response.json()) as {
      meetings?: readonly { id: number | string; join_url?: string; agenda?: string }[];
      next_page_token?: string;
    };
    const encontrada = (data.meetings ?? []).find(
      ({ agenda, join_url }) => join_url && agenda?.includes(marca)
    );
    if (encontrada?.join_url) {
      return { meetingId: String(encontrada.id), joinUrl: encontrada.join_url };
    }
    return data.next_page_token ? buscarPagina(data.next_page_token) : null;
  };
  return buscarPagina(null);
}

/** Consulta la configuración efectiva de sala de espera; null significa que Zoom no informó el dato. */
export async function obtenerSalaEsperaZoomHttp(token: string, meetingId: string): Promise<boolean | null> {
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(5000)
  });
  if (!response.ok) {
    throw new Error(`Zoom API error al consultar sala de espera (${response.status})`);
  }
  const data = (await response.json()) as { settings?: { waiting_room?: unknown } };
  return typeof data.settings?.waiting_room === "boolean" ? data.settings.waiting_room : null;
}
