import type { ProveedorTokenZoom } from "./zoom-client";

export type CodigoErrorZoom =
  | "NO_AUTORIZADO"
  | "CAPACIDAD_PENDIENTE"
  | "NO_ENCONTRADO"
  | "LIMITE_TASA"
  | "SOLICITUD_RECHAZADA"
  | "ERROR_ZOOM"
  | "RESPUESTA_INCOMPLETA"
  | "PAGINACION_REPETIDA"
  | "VENTANA_INVALIDA"
  | "IDENTIDAD_INCONSISTENTE"
  | "HOST_NO_PERMITIDO"
  | "DESTINO_NO_PERMITIDO"
  | "REDIRECCIONES_EXCESIVAS"
  | "CONTENT_RANGE_INVALIDO"
  | "TAMANO_INCONSISTENTE"
  | "CONTENIDO_NO_ES_ARCHIVO"
  | "DESCARGA_RECHAZADA";

/**
 * Error público de los clientes Zoom: un código estable y el recurso interno afectado.
 * Nunca incorpora URLs firmadas ni cuerpos de respuesta crudos.
 */
export class ZoomApiError extends Error {
  readonly code: CodigoErrorZoom;
  readonly recurso: string;
  readonly status: number | null;
  readonly reintentarEnSegundos: number | null;

  constructor(
    code: CodigoErrorZoom,
    recurso: string,
    opciones: Readonly<{ status?: number; reintentarEnSegundos?: number }> = {}
  ) {
    super(`Zoom: ${code} (${recurso}${opciones.status ? `, HTTP ${opciones.status}` : ""})`);
    this.name = "ZoomApiError";
    this.code = code;
    this.recurso = recurso;
    this.status = opciones.status ?? null;
    this.reintentarEnSegundos = opciones.reintentarEnSegundos ?? null;
  }
}

/** Token fijo (sin reintento ante 401) o proveedor que renueva el token rechazado una vez. */
export type AutenticacionZoom = string | ProveedorTokenZoom;

/** Espera máxima aceptada por Retry-After; si Zoom pide más, se informa y se devuelve el control. */
export const ESPERA_MAXIMA_REINTENTO_SEGUNDOS = 30;

export function segundosRetryAfter(valor: string | null, ahora: number = Date.now()): number {
  if (!valor) return 1;
  const numero = Number(valor.trim());
  if (Number.isFinite(numero) && numero >= 0) return Math.ceil(numero);
  const fecha = Date.parse(valor);
  return Number.isFinite(fecha) ? Math.max(0, Math.ceil((fecha - ahora) / 1000)) : 1;
}

function esperar(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolver, rechazar) => {
    if (signal?.aborted) return rechazar(signal.reason);
    const temporizador = setTimeout(() => {
      signal?.removeEventListener("abort", alAbortar);
      resolver();
    }, ms);
    const alAbortar = () => {
      clearTimeout(temporizador);
      rechazar(signal?.reason);
    };
    signal?.addEventListener("abort", alAbortar, { once: true });
  });
}

async function descartarCuerpo(response: Response): Promise<void> {
  await response.body?.cancel().catch(() => undefined);
}

/**
 * Ejecuta una solicitud autenticada con a lo sumo un reintento por 401 (token renovado) y
 * a lo sumo un reintento por 429 (respetando Retry-After). Devuelve cualquier otra respuesta
 * para que el llamador la interprete.
 */
export async function pedirZoom(
  auth: AutenticacionZoom,
  recurso: string,
  hacer: (token: string) => Promise<Response>,
  signal?: AbortSignal
): Promise<Response> {
  const proveedor = typeof auth === "string" ? null : auth;
  let token = proveedor ? await proveedor.obtener() : (auth as string);
  let renovado = false;
  let esperado429 = false;

  for (;;) {
    const response = await hacer(token);
    if (response.status === 401) {
      await descartarCuerpo(response);
      if (!proveedor || renovado) throw new ZoomApiError("NO_AUTORIZADO", recurso, { status: 401 });
      renovado = true;
      token = await proveedor.renovar(token);
      continue;
    }
    if (response.status === 429) {
      const segundos = segundosRetryAfter(response.headers.get("retry-after"));
      await descartarCuerpo(response);
      if (esperado429 || segundos > ESPERA_MAXIMA_REINTENTO_SEGUNDOS) {
        throw new ZoomApiError("LIMITE_TASA", recurso, { status: 429, reintentarEnSegundos: segundos });
      }
      esperado429 = true;
      await esperar(segundos * 1000, signal);
      continue;
    }
    return response;
  }
}

/** Convierte un estado HTTP no exitoso en un error público sin copiar el cuerpo. */
export function errorPorEstado(recurso: string, status: number): ZoomApiError {
  if (status === 403) return new ZoomApiError("CAPACIDAD_PENDIENTE", recurso, { status });
  if (status === 404) return new ZoomApiError("NO_ENCONTRADO", recurso, { status });
  if (status >= 400 && status < 500) return new ZoomApiError("SOLICITUD_RECHAZADA", recurso, { status });
  return new ZoomApiError("ERROR_ZOOM", recurso, { status });
}

/** Zoom exige doble codificación si el UUID empieza con "/" o contiene "//". */
export function codificarUuidZoom(uuid: string): string {
  const unaVez = encodeURIComponent(uuid);
  return uuid.startsWith("/") || uuid.includes("//") ? encodeURIComponent(unaVez) : unaVez;
}
