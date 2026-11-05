const SINCRONIZADO = "Cuentas sincronizadas con el grupo de Zoom.";
const ERROR_SINCRONIZAR = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo.";
const ERROR_VISTA_PREVIA = "No se pudo revisar la sincronización con el grupo de Zoom. Probá de nuevo.";

/** Lo que cambiaría la sincronización (`POST … { vistaPrevia: true }`). Las cuentas van por correo. */
export type VistaPreviaSincronizacion = Readonly<{
  resumen: string;
  masivo: boolean;
  avisoMasivo: string | null;
  revision: string;
  crear: readonly string[];
  reactivar: readonly string[];
  desactivar: readonly string[];
  marcarFuera: readonly Readonly<{ email: string; reunionesFuturas: number }>[];
  sinLicencia: readonly string[];
  pierdenLicencia: readonly string[];
}>;

function esListaDeTextos(valor: unknown): valor is readonly string[] {
  return Array.isArray(valor) && valor.every((item) => typeof item === "string");
}

function esListaFuera(valor: unknown): valor is VistaPreviaSincronizacion["marcarFuera"] {
  return Array.isArray(valor) && valor.every((item) =>
    item !== null && typeof item === "object" &&
    typeof (item as Record<string, unknown>).email === "string" &&
    typeof (item as Record<string, unknown>).reunionesFuturas === "number"
  );
}

/**
 * Interpreta la respuesta de la vista previa. Con `ok: false` (grupo vacío, permisos, sesión)
 * devuelve el mensaje a mostrar, con la misma lectura que `resultadoSincronizacion`.
 */
export function leerVistaPrevia(
  data: unknown
): Readonly<{ ok: true; vistaPrevia: VistaPreviaSincronizacion } | { ok: false; mensaje: string }> {
  const respuesta = comoObjeto(data);
  if (respuesta.ok !== true) return { ok: false, mensaje: textoDeRespuesta(respuesta) ?? ERROR_VISTA_PREVIA };
  const { resumen, masivo, avisoMasivo, revision, crear, reactivar, desactivar, marcarFuera, sinLicencia, pierdenLicencia } = respuesta;
  const valida = typeof resumen === "string" && typeof masivo === "boolean" &&
    (avisoMasivo === null || typeof avisoMasivo === "string") &&
    typeof revision === "string" && /^[0-9a-f]{64}$/.test(revision) &&
    esListaDeTextos(crear) && esListaDeTextos(reactivar) && esListaDeTextos(desactivar) && esListaFuera(marcarFuera) &&
    esListaDeTextos(sinLicencia) && esListaDeTextos(pierdenLicencia);
  if (!valida) return { ok: false, mensaje: ERROR_VISTA_PREVIA };
  return { ok: true, vistaPrevia: { resumen, masivo, avisoMasivo, revision, crear, reactivar, desactivar, marcarFuera, sinLicencia, pierdenLicencia } };
}

/** Si la sincronización no cambiaría ninguna cuenta (los miembros sin licencia de antes no cuentan). */
export function vistaPreviaSinCambios(vistaPrevia: VistaPreviaSincronizacion): boolean {
  return [vistaPrevia.crear, vistaPrevia.reactivar, vistaPrevia.desactivar, vistaPrevia.marcarFuera, vistaPrevia.pierdenLicencia]
    .every((lista) => lista.length === 0);
}

/**
 * Cuerpo del POST que confirma la sincronización. Solo confirma si la vista previa ya mostró una
 * sincronización masiva: si el grupo cambió desde entonces y ahora lo es, el servidor la rechaza.
 */
export function pedidoDeSincronizacion(vistaPrevia: VistaPreviaSincronizacion): Readonly<{ confirmar: boolean; revision: string }> {
  return { confirmar: vistaPrevia.masivo, revision: vistaPrevia.revision };
}

/**
 * Interpreta la respuesta de `POST /api/v1/configuracion/zoom/grupo`. El resultado viaja en
 * `ok` y `resumen` sea cual sea el código HTTP (200 con `ok: false` incluido); las respuestas
 * de sesión o permisos solo traen `error`.
 */
export function resultadoSincronizacion(data: unknown): Readonly<{ ok: boolean; mensaje: string }> {
  const respuesta = comoObjeto(data);
  const ok = respuesta.ok === true;
  return { ok, mensaje: textoDeRespuesta(respuesta) ?? (ok ? SINCRONIZADO : ERROR_SINCRONIZAR) };
}

function comoObjeto(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === "object" ? data as Record<string, unknown> : {};
}

/** `resumen` y, si no hay, `error` (las respuestas de sesión o permisos solo traen `error`). */
function textoDeRespuesta(respuesta: Record<string, unknown>): string | null {
  const resumen = typeof respuesta.resumen === "string" && respuesta.resumen ? respuesta.resumen : null;
  const error = typeof respuesta.error === "string" && respuesta.error ? respuesta.error : null;
  return resumen ?? error;
}

/** Si se puede pedir la vista previa: hay grupo guardado, nada en curso, ni selector ni vista previa abiertos. */
export function puedeRevisarSincronizacion(
  { grupoId, ocupado, eligiendo, hayVistaPrevia }:
    Readonly<{ grupoId: string | null; ocupado: boolean; eligiendo: boolean; hayVistaPrevia: boolean }>
): boolean {
  return Boolean(grupoId) && !ocupado && !eligiendo && !hayVistaPrevia;
}
