const SINCRONIZADO = "Cuentas sincronizadas con el grupo de Zoom.";
const ERROR_SINCRONIZAR = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo.";

/**
 * Interpreta la respuesta de `POST /api/v1/configuracion/zoom/grupo`. El resultado viaja en
 * `ok` y `resumen` sea cual sea el código HTTP (200 con `ok: false` incluido); las respuestas
 * de sesión o permisos solo traen `error`.
 */
export function resultadoSincronizacion(data: unknown): Readonly<{ ok: boolean; mensaje: string }> {
  const respuesta = data !== null && typeof data === "object" ? data as Record<string, unknown> : {};
  const ok = respuesta.ok === true;
  const resumen = typeof respuesta.resumen === "string" && respuesta.resumen ? respuesta.resumen : null;
  const error = typeof respuesta.error === "string" && respuesta.error ? respuesta.error : null;
  return { ok, mensaje: resumen ?? error ?? (ok ? SINCRONIZADO : ERROR_SINCRONIZAR) };
}
