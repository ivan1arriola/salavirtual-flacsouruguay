import type { ReferenciaOcurrenciaZoom, ResultadoPagina } from "@/src/modules/archivos/domain/zoom-archivos.types";
import { particionarPeriodoZoom, type VentanaZoom } from "@/src/modules/archivos/domain/zoom-recuperacion.domain";
import {
  ZoomApiError,
  codificarUuidZoom,
  errorPorEstado,
  pedirZoom,
  type AutenticacionZoom
} from "./zoom-http";

const API = "https://api.zoom.us/v2";
const ZONA_NEGOCIO = "America/Montevideo";
const TIEMPO_MAXIMO_MS = 15_000;
const MS_POR_DIA = 86_400_000;

/** Ventana de consulta para un anfitrión: fechas inclusivas en hora de Montevideo. */
export type VentanaConsultaZoom = VentanaZoom & Readonly<{
  cuentaZoomId: string;
  /** true consulta la papelera de Zoom (recuperaciones). */
  papelera?: boolean;
}>;

/**
 * Inventario de una ocurrencia. `respuesta` es la forma saneada que consume el dominio
 * (`normalizarInventarioZoom`); las URLs de descarga son propiedades no enumerables y solo se
 * obtienen con `urlDescarga`, de modo que serializar el objeto nunca las persiste.
 */
export type InventarioZoomHttp = Readonly<{
  uuid: string;
  meetingId: string | null;
  respuesta: Readonly<Record<string, unknown>>;
  urlDescarga: (archivoZoomId: string) => string | null;
}>;

export type ResumenReunionZoom =
  | Readonly<{ estado: "DISPONIBLE"; resumen: Readonly<Record<string, unknown>> }>
  | Readonly<{ estado: "NO_DISPONIBLE" }>
  | Readonly<{ estado: "CAPACIDAD_PENDIENTE"; recurso: "meeting_summary" }>;

type Registro = Record<string, unknown>;

const CAMPOS_SENSIBLES = new Set([
  "password", "passcode", "recording_play_passcode", "play_url", "share_url",
  "download_access_token", "start_url", "join_url"
]);

function esRegistro(valor: unknown): valor is Registro {
  return typeof valor === "object" && valor !== null && !Array.isArray(valor);
}

function texto(valor: unknown): string | null {
  if (typeof valor === "number" && Number.isFinite(valor)) return String(valor);
  return typeof valor === "string" && valor.trim() !== "" ? valor.trim() : null;
}

async function leerJson(response: Response, recurso: string): Promise<Registro> {
  const dato: unknown = await response.json().catch(() => null);
  if (!esRegistro(dato)) throw new ZoomApiError("RESPUESTA_INCOMPLETA", recurso);
  return dato;
}

function fechaMontevideo(fecha: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: ZONA_NEGOCIO, year: "numeric", month: "2-digit", day: "2-digit"
  }).format(fecha);
}

function desplazarDia(fecha: string, dias: number): string {
  const [a, m, d] = fecha.split("-").map(Number);
  return new Date(Date.UTC(a, m - 1, d) + dias * MS_POR_DIA).toISOString().slice(0, 10);
}

function validarVentana(ventana: VentanaZoom): void {
  try {
    if (particionarPeriodoZoom(ventana.desde, ventana.hasta).length === 1) return;
  } catch {
    // Fecha inválida o rango invertido: se informa abajo con el mismo código.
  }
  throw new ZoomApiError("VENTANA_INVALIDA", "grabaciones.listado");
}

/**
 * Lista una página de las reuniones con grabaciones de un anfitrión. Zoom filtra por fecha UTC,
 * por eso se consulta ±1 día y después se conserva solo lo cuyo inicio real cae, en hora de
 * Montevideo, dentro de la ventana. Cualquier respuesta incompleta o rechazo es un error: nunca
 * se devuelve una página parcial que permita marcar el barrido como completo.
 */
export async function listarGrabacionesAnfitrionZoomHttp(
  auth: AutenticacionZoom,
  anfitrionId: string,
  ventana: VentanaConsultaZoom,
  cursor: string | null
): Promise<ResultadoPagina<ReferenciaOcurrenciaZoom>> {
  const recurso = ventana.papelera ? "grabaciones.papelera" : "grabaciones.listado";
  validarVentana(ventana);
  const params = new URLSearchParams({
    from: desplazarDia(ventana.desde, -1),
    to: desplazarDia(ventana.hasta, 1),
    page_size: "300"
  });
  if (ventana.papelera) {
    params.set("trash", "true");
    params.set("trash_type", "meeting_recordings");
  }
  if (cursor) params.set("next_page_token", cursor);

  const response = await pedirZoom(auth, recurso, (token) =>
    fetch(`${API}/users/${encodeURIComponent(anfitrionId)}/recordings?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS)
    })
  );
  if (!response.ok) throw errorPorEstado(recurso, response.status);

  const datos = await leerJson(response, recurso);
  if (!Array.isArray(datos.meetings)) throw new ZoomApiError("RESPUESTA_INCOMPLETA", recurso);
  const siguiente = texto(datos.next_page_token);
  if (siguiente !== null && siguiente === cursor) throw new ZoomApiError("PAGINACION_REPETIDA", recurso);

  const elementos = datos.meetings.flatMap((reunion: unknown): ReferenciaOcurrenciaZoom[] => {
    if (!esRegistro(reunion)) throw new ZoomApiError("RESPUESTA_INCOMPLETA", recurso);
    const uuid = texto(reunion.uuid);
    const meetingId = texto(reunion.id);
    const inicio = texto(reunion.start_time) ? new Date(String(reunion.start_time)) : null;
    if (!uuid || !meetingId || !inicio || Number.isNaN(inicio.getTime())) {
      throw new ZoomApiError("RESPUESTA_INCOMPLETA", recurso);
    }
    const dia = fechaMontevideo(inicio);
    if (dia < ventana.desde || dia > ventana.hasta) return [];
    return [{
      cuentaZoomId: ventana.cuentaZoomId,
      uuid,
      meetingId,
      anfitrionZoomId: texto(reunion.host_id) ?? anfitrionId,
      inicioRealAt: inicio,
      titulo: texto(reunion.topic) ?? ""
    }];
  });

  return { elementos, siguiente };
}

function sanearElemento(elemento: unknown): unknown {
  if (!esRegistro(elemento)) return elemento;
  const limpio: Registro = {};
  for (const [clave, valor] of Object.entries(elemento)) {
    if (CAMPOS_SENSIBLES.has(clave)) continue;
    if (clave === "download_url") {
      // No enumerable: el dominio la lee para saber si es descargable, pero JSON.stringify la omite.
      Object.defineProperty(limpio, clave, { value: valor, enumerable: false });
    } else {
      limpio[clave] = valor;
    }
  }
  return limpio;
}

function sanearInventario(datos: Registro): Registro {
  return Object.fromEntries(
    Object.entries(datos)
      .filter(([clave]) => !CAMPOS_SENSIBLES.has(clave))
      .map(([clave, valor]) => [clave, Array.isArray(valor) ? valor.map(sanearElemento) : valor])
  );
}

/**
 * Inventario de todas las colecciones de una ocurrencia (por UUID, nunca por el ID numérico
 * reutilizado por una serie). null: Zoom no tiene grabaciones para ese UUID (404); un inventario
 * vacío es un resultado distinto.
 */
export async function obtenerInventarioOcurrenciaZoomHttp(
  auth: AutenticacionZoom,
  uuid: string
): Promise<InventarioZoomHttp | null> {
  const recurso = "grabaciones.inventario";
  const response = await pedirZoom(auth, recurso, (token) =>
    fetch(`${API}/meetings/${codificarUuidZoom(uuid)}/recordings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS)
    })
  );
  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return null;
  }
  if (!response.ok) throw errorPorEstado(recurso, response.status);

  const datos = await leerJson(response, recurso);
  const uuidRespuesta = texto(datos.uuid);
  if (uuidRespuesta !== null && uuidRespuesta !== uuid) throw new ZoomApiError("IDENTIDAD_INCONSISTENTE", recurso);

  const respuesta = sanearInventario(datos);
  const urlDescarga = (archivoZoomId: string): string | null => {
    for (const valor of Object.values(respuesta)) {
      if (!Array.isArray(valor)) continue;
      for (const elemento of valor) {
        if (esRegistro(elemento) && texto(elemento.id) === archivoZoomId) return texto(elemento.download_url);
      }
    }
    return null;
  };
  return { uuid, meetingId: texto(datos.id), respuesta, urlDescarga };
}

/**
 * Resumen de AI Companion (`/meetings/{id}/meeting_summary`, scope propio). Un 403 es una
 * capacidad pendiente visible, jamás "no hay resumen".
 */
export async function obtenerResumenReunionZoomHttp(
  auth: AutenticacionZoom,
  meetingUuid: string
): Promise<ResumenReunionZoom> {
  const recurso = "meeting_summary";
  const response = await pedirZoom(auth, recurso, (token) =>
    fetch(`${API}/meetings/${codificarUuidZoom(meetingUuid)}/meeting_summary`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(TIEMPO_MAXIMO_MS)
    })
  );
  if (response.status === 403) {
    await response.body?.cancel().catch(() => undefined);
    return { estado: "CAPACIDAD_PENDIENTE", recurso };
  }
  if (response.status === 404) {
    await response.body?.cancel().catch(() => undefined);
    return { estado: "NO_DISPONIBLE" };
  }
  if (!response.ok) throw errorPorEstado(recurso, response.status);
  return { estado: "DISPONIBLE", resumen: await leerJson(response, recurso) };
}
