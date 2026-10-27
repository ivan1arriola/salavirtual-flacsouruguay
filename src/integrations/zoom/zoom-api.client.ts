/**
 * Cliente técnico de la API REST de Zoom (Server-to-Server OAuth).
 *
 * No contiene reglas de negocio: autentica, hace las llamadas HTTP y traduce
 * errores. Las decisiones (qué cohosts aplicar, cómo calcular asistencia)
 * viven en los módulos de dominio.
 */

export const ZOOM_API_BASE_URL = "https://api.zoom.us/v2";
export const ZOOM_OAUTH_URL = "https://zoom.us/oauth/token";
export const ZOOM_HTTP_TIMEOUT_MS = 30_000;

export type ZoomCredentials = Readonly<{
  accountId: string;
  clientId: string;
  clientSecret: string;
}>;

export type ZoomFetch = (input: string, init?: RequestInit) => Promise<Response>;

export type ZoomClientOptions = Readonly<{
  fetch?: ZoomFetch;
  ahora?: () => number;
  esperar?: (ms: number) => Promise<void>;
}>;

export class ZoomApiError extends Error {
  readonly status: number;
  readonly code: number | null;

  constructor(message: string, status: number, code: number | null) {
    super(message);
    this.name = "ZoomApiError";
    this.status = status;
    this.code = code;
  }
}

/** Zoom devuelve 404 con código 3001 (reunión) o 1001 (usuario) cuando no existe. */
export function esRecursoZoomInexistente(error: unknown): boolean {
  return error instanceof ZoomApiError && (error.status === 404 || error.code === 3001);
}

export function esFaltaDeScopesZoom(error: unknown): boolean {
  if (!(error instanceof ZoomApiError)) return false;
  return error.code === 4711 || /does not contain scopes|scope/i.test(error.message);
}

type TokenCache = { token: string; expiraEn: number };
const tokenCache = new Map<string, TokenCache>();

/** Solo para pruebas. */
export function limpiarCacheTokensZoom(): void {
  tokenCache.clear();
}

export type ZoomClient = Readonly<{
  get<T>(path: string, query?: Readonly<Record<string, string | number | undefined>>): Promise<T>;
  post<T>(path: string, body: unknown): Promise<T>;
  patch(path: string, body: unknown): Promise<void>;
  delete(path: string, query?: Readonly<Record<string, string | number | undefined>>): Promise<void>;
  /** Descarga autenticada (grabaciones). Devuelve la respuesta para leerla como stream. */
  descargar(url: string): Promise<Response>;
  obtenerToken(): Promise<string>;
}>;

export function crearZoomClient(
  credentials: ZoomCredentials,
  options: ZoomClientOptions = {}
): ZoomClient {
  const fetchFn: ZoomFetch = options.fetch ?? ((input, init) => fetch(input, init));
  const ahora = options.ahora ?? Date.now;
  const esperar = options.esperar ?? ((ms: number) => new Promise((resolve) => setTimeout(resolve, ms)));
  const cacheKey = `${credentials.accountId}:${credentials.clientId}`;

  async function obtenerToken(): Promise<string> {
    const cached = tokenCache.get(cacheKey);
    if (cached && cached.expiraEn - 60_000 > ahora()) return cached.token;

    const basic = Buffer.from(`${credentials.clientId}:${credentials.clientSecret}`).toString("base64");
    const url = `${ZOOM_OAUTH_URL}?${new URLSearchParams({
      grant_type: "account_credentials",
      account_id: credentials.accountId,
    })}`;
    const response = await fetchFn(url, {
      method: "POST",
      headers: { Authorization: `Basic ${basic}` },
      signal: AbortSignal.timeout(ZOOM_HTTP_TIMEOUT_MS),
    });
    const data = (await response.json().catch(() => ({}))) as {
      access_token?: string;
      expires_in?: number;
      reason?: string;
      error?: string;
    };
    if (!response.ok || !data.access_token) {
      throw new ZoomApiError(
        `Zoom rechazó las credenciales: ${data.reason ?? data.error ?? response.statusText}`,
        response.status,
        null
      );
    }
    tokenCache.set(cacheKey, {
      token: data.access_token,
      expiraEn: ahora() + (data.expires_in ?? 3600) * 1000,
    });
    return data.access_token;
  }

  async function request(
    method: "GET" | "POST" | "PATCH" | "DELETE",
    path: string,
    body?: unknown,
    query?: Readonly<Record<string, string | number | undefined>>
  ): Promise<Response> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value !== undefined && value !== "") params.set(key, String(value));
    }
    const url = `${ZOOM_API_BASE_URL}${path}${params.size > 0 ? `?${params}` : ""}`;
    // Solo las lecturas se reintentan: un POST/PATCH perdido pudo haberse aplicado.
    const intentos = method === "GET" ? 4 : 1;

    for (let intento = 0; intento < intentos; intento++) {
      const token = await obtenerToken();
      const response = await fetchFn(url, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
        signal: AbortSignal.timeout(ZOOM_HTTP_TIMEOUT_MS),
      });
      if (response.ok) return response;

      if (response.status === 401 && intento === 0) {
        tokenCache.delete(cacheKey);
      }
      const retryable = response.status === 429 || response.status >= 500 || response.status === 401;
      if (retryable && intento < intentos - 1) {
        const retryAfter = Number(response.headers.get("retry-after"));
        await esperar(Number.isFinite(retryAfter) && retryAfter > 0
          ? Math.min(30_000, retryAfter * 1000)
          : Math.min(8_000, 500 * 2 ** intento));
        continue;
      }
      const data = (await response.json().catch(() => ({}))) as { code?: number; message?: string };
      throw new ZoomApiError(
        `Zoom ${method} ${path}: ${data.message ?? response.statusText} (HTTP ${response.status})`,
        response.status,
        typeof data.code === "number" ? data.code : null
      );
    }
    throw new ZoomApiError(`Zoom ${method} ${path}: se agotaron los reintentos.`, 503, null);
  }

  return {
    async get<T>(path: string, query?: Readonly<Record<string, string | number | undefined>>) {
      const response = await request("GET", path, undefined, query);
      return (await response.json()) as T;
    },
    async post<T>(path: string, body: unknown) {
      const response = await request("POST", path, body);
      return (await response.json()) as T;
    },
    async patch(path: string, body: unknown) {
      await request("PATCH", path, body);
    },
    async delete(path: string, query?: Readonly<Record<string, string | number | undefined>>) {
      await request("DELETE", path, undefined, query);
    },
    async descargar(url: string) {
      const token = await obtenerToken();
      const response = await fetchFn(url, {
        method: "GET",
        headers: { Authorization: `Bearer ${token}` },
        redirect: "follow",
      });
      if (!response.ok || !response.body) {
        throw new ZoomApiError(
          `No se pudo descargar la grabación de Zoom (HTTP ${response.status}).`,
          response.status,
          null
        );
      }
      return response;
    },
    obtenerToken,
  };
}

/**
 * Los UUID de reuniones pasadas que empiezan con "/" o contienen "//" deben
 * codificarse dos veces en la ruta (requisito documentado de Zoom).
 */
export function codificarUuidZoom(uuid: string): string {
  const once = encodeURIComponent(uuid);
  return uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(once) : once;
}
