/** Reintentos acotados y exclusivos de operaciones cuya repetición sea segura. */
export type RetryOptions = Readonly<{
  intentosMaximos?: number;
  demoraBaseMs?: number;
  demoraMaximaMs?: number;
  esperar?: (milliseconds: number) => Promise<void>;
  aleatorio?: () => number;
  ahora?: () => number;
}>;

const TRANSIENT_NETWORK_CODES = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "ECONNABORTED",
  "EAI_AGAIN",
  "EPIPE",
  "UND_ERR_CONNECT_TIMEOUT",
  "UND_ERR_HEADERS_TIMEOUT",
  "UND_ERR_SOCKET"
]);
const TRANSIENT_HTTP_STATUSES = new Set([408, 429, 500, 502, 503, 504]);

/**
 * Legacy quota-only retry helper; preserve the existing deterministic backoff.
 * The caller must guarantee it is safe to repeat the operation.
 */
export async function conReintentosPorLimiteGoogle<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retry(operation, options, esLimiteTemporalGoogle, false);
}

/**
 * Use ONLY for read-only Google API calls (GET). Never automatically retry POST
 * for Gmail, Drive uploads or Meet space creation: responses may be lost after
 * the remote side committed the operation.
 */
export async function conReintentosGoogleLectura<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retry(operation, options, esFalloTemporalGoogle, true);
}

async function retry<T>(
  operation: () => Promise<T>,
  options: RetryOptions,
  retryable: (error: unknown) => boolean,
  jitter: boolean
): Promise<T> {
  const attempts = boundedInteger(options.intentosMaximos ?? 4, 1, 6);
  const base = boundedInteger(options.demoraBaseMs ?? 500, 1, 30_000);
  const maxDelay = boundedInteger(options.demoraMaximaMs ?? 30_000, 1, 60_000);
  const sleepFn = options.esperar ?? sleep;
  const random = options.aleatorio ?? Math.random;
  const clock = options.ahora ?? Date.now;

  for (let attempt = 0; attempt < attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      if (!retryable(error) || attempt === attempts - 1) {
        throw error;
      }
      const backoff = Math.min(maxDelay, base * 2 ** attempt);
      const jittered = jitter
        ? Math.round(backoff * (0.5 + Math.min(1, Math.max(0, random())) * 0.5))
        : backoff;
      const retryAfter = obtenerRetryAfterMs(error, clock());
      await sleepFn(Math.min(maxDelay, Math.max(jittered, retryAfter ?? 0)));
    }
  }
  throw new Error("La operación con Google agotó el número máximo de intentos.");
}

function boundedInteger(value: number, min: number, max: number): number {
  return Number.isFinite(value) ? Math.max(min, Math.min(max, Math.floor(value))) : min;
}

export function esLimiteTemporalGoogle(error: unknown): boolean {
  const status = errorStatus(error);
  if (status === 429) {
    return true;
  }
  if (status !== 403) {
    return false;
  }
  const detail = errorDetails(error);
  // Never retry permissionDenied / insufficientPermissions / dailyLimitExceeded.
  return (
    /rate.?limit|userRateLimitExceeded|quotaExceeded|RESOURCE_EXHAUSTED/i.test(detail) &&
    !/dailyLimitExceeded|permissionDenied|insufficientPermissions/i.test(detail)
  );
}

export function esFalloTemporalGoogle(error: unknown): boolean {
  if (esLimiteTemporalGoogle(error)) {
    return true;
  }
  const status = errorStatus(error);
  if (status !== null) {
    return TRANSIENT_HTTP_STATUSES.has(status);
  }
  if (!error || typeof error !== "object") {
    return false;
  }
  const candidate = error as { code?: unknown; cause?: unknown };
  if (typeof candidate.code === "string" && TRANSIENT_NETWORK_CODES.has(candidate.code.toUpperCase())) {
    return true;
  }
  if (candidate.cause && candidate.cause !== error) {
    return esFalloTemporalGoogle(candidate.cause);
  }
  return false;
}

function errorStatus(error: unknown): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const candidate = error as { code?: unknown; status?: unknown; response?: { status?: unknown } };
  const value = candidate.response?.status ?? candidate.status ?? candidate.code;
  if (typeof value === "number") {
    return Number.isInteger(value) ? value : null;
  }
  if (typeof value === "string" && /^\d{3}$/.test(value)) {
    return Number(value);
  }
  return null;
}

function errorDetails(error: unknown): string {
  if (!error || typeof error !== "object") {
    return "";
  }
  const candidate = error as { message?: unknown; response?: { data?: unknown } };
  let payload = "";
  try {
    payload = JSON.stringify(candidate.response?.data ?? "");
  } catch {
    /* cyclic provider errors */
  }
  return `${String(candidate.message ?? "")} ${payload}`;
}

function obtenerRetryAfterMs(error: unknown, now: number): number | null {
  if (!error || typeof error !== "object") {
    return null;
  }
  const headers = (
    error as {
      response?: { headers?: { get?: (name: string) => string | null } | Record<string, unknown> };
    }
  ).response?.headers;
  if (!headers) {
    return null;
  }
  const raw =
    "get" in headers && typeof headers.get === "function"
      ? headers.get("retry-after")
      : ((headers as Record<string, unknown>)["retry-after"] ??
        (headers as Record<string, unknown>)["Retry-After"]);
  if (raw === undefined || raw === null || String(raw).trim() === "") {
    return null;
  }
  const value = String(raw).trim();
  if (/^\d+(?:\.\d+)?$/.test(value)) {
    return Number(value) * 1000;
  }
  const date = Date.parse(value);
  return Number.isFinite(date) ? Math.max(0, date - now) : null;
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
