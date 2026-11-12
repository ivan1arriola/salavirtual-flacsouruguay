const MINUTO = 60_000;
/** 1 min, 5 min, 15 min, 1 h y máximo 6 h entre reintentos. */
const ESCALA_MS = Object.freeze([1 * MINUTO, 5 * MINUTO, 15 * MINUTO, 60 * MINUTO, 6 * 60 * MINUTO]);
export const MAXIMO_BACKOFF_ZOOM_MS = ESCALA_MS[ESCALA_MS.length - 1]!;
export const FALLOS_CONSECUTIVOS_PARA_REVISION_ZOOM = 10;

/**
 * Próximo intento con jitter de ±20 %. `intentos` es el número de fallos ya consumidos (≥1).
 * Una espera indicada por el proveedor (429/Retry-After) solo puede alargar la espera, nunca acortarla.
 */
export function proximoIntentoZoom(
  intentos: number,
  ahora: Date,
  aleatorio: () => number,
  reintentarEnSegundos: number | null = null
): Date {
  const indice = Math.min(Math.max(Math.trunc(intentos) - 1, 0), ESCALA_MS.length - 1);
  const base = ESCALA_MS[indice]!;
  const jitter = 1 + (aleatorio() * 0.4 - 0.2);
  const propia = Math.min(Math.round(base * jitter), MAXIMO_BACKOFF_ZOOM_MS);
  const proveedor =
    reintentarEnSegundos !== null && Number.isFinite(reintentarEnSegundos) && reintentarEnSegundos > 0
      ? reintentarEnSegundos * 1000
      : 0;
  return new Date(ahora.getTime() + Math.max(propia, proveedor));
}
