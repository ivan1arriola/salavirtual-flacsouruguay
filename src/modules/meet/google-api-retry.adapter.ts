type RetryOptions = Readonly<{
  intentosMaximos?: number;
  demoraBaseMs?: number;
  esperar?: (milliseconds: number) => Promise<void>;
}>;

export async function conReintentosPorLimiteGoogle<T>(
  operation: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const intentosMaximos = options.intentosMaximos ?? 6;
  const demoraBaseMs = options.demoraBaseMs ?? 500;
  const esperar = options.esperar ?? sleep;

  for (let intento = 0; intento < intentosMaximos; intento += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!esLimiteTemporalGoogle(error) || intento === intentosMaximos - 1) throw error;
      await esperar(Math.max(
        obtenerRetryAfterMs(error) ?? 0,
        demoraBaseMs * (2 ** intento)
      ));
    }
  }

  throw new Error("No se pudo completar la operación con Google.");
}

export function esLimiteTemporalGoogle(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const candidate = error as {
    code?: unknown;
    status?: unknown;
    message?: unknown;
    response?: { status?: unknown; data?: unknown };
  };
  const status = candidate.response?.status ?? candidate.status ?? candidate.code;
  if (status === 429) return true;
  if (status !== 403) return false;
  const detail = `${String(candidate.message ?? "")} ${safeStringify(candidate.response?.data)}`;
  return /rate.?limit|quota|too many requests/i.test(detail);
}

function obtenerRetryAfterMs(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const headers = (error as {
    response?: { headers?: { get?: (name: string) => string | null } | Record<string, unknown> };
  }).response?.headers;
  if (!headers) return null;
  const raw = "get" in headers && typeof headers.get === "function"
    ? headers.get("retry-after")
    : (headers as Record<string, unknown>)["retry-after"];
  const seconds = Number(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function safeStringify(value: unknown): string {
  try {
    return JSON.stringify(value);
  } catch {
    return "";
  }
}

function sleep(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
