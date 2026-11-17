import type { ReunionZoomRemota } from "@/src/modules/operaciones/zoom-diagnostico.domain";
import {
  codificarUuidZoom,
  errorPorRespuesta,
  pedirZoom,
  ZoomApiError,
  type AutenticacionZoom
} from "./zoom-http";

const API = "https://api.zoom.us/v2";
const MAX_PAGINAS = 20;

/** Inventario paginado de la cuenta: un error nunca se interpreta como agenda vacía. */
export async function listarProximasReunionesCuentaZoom(
  auth: AutenticacionZoom,
  usuarioZoomId: string
): Promise<readonly ReunionZoomRemota[]> {
  const resultado: ReunionZoomRemota[] = [];
  const vistos = new Set<string>();
  let token = "";
  for (let pagina = 0; pagina < MAX_PAGINAS; pagina++) {
    const url = new URL(`${API}/users/${encodeURIComponent(usuarioZoomId)}/meetings`);
    url.searchParams.set("type", "upcoming");
    url.searchParams.set("page_size", "300");
    if (token) {
      url.searchParams.set("next_page_token", token);
    }
    const respuesta = await pedirZoom(auth, "agenda-cuenta", (accessToken) =>
      fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        cache: "no-store",
        signal: AbortSignal.timeout(12000)
      })
    );
    if (!respuesta.ok) {
      throw await errorPorRespuesta("agenda-cuenta", respuesta);
    }
    const datos = (await respuesta.json()) as {
      meetings?: { id?: string | number; start_time?: string }[];
      next_page_token?: string;
    };
    if (!Array.isArray(datos.meetings)) {
      throw new ZoomApiError("RESPUESTA_INCOMPLETA", "agenda-cuenta");
    }
    resultado.push(
      ...datos.meetings.flatMap((reunion) => {
        if (!reunion.id) {
          return [];
        }
        const fecha = reunion.start_time ? new Date(reunion.start_time) : null;
        return [
          { meetingId: String(reunion.id), inicio: fecha && Number.isFinite(fecha.getTime()) ? fecha : null }
        ];
      })
    );
    token = datos.next_page_token ?? "";
    if (!token) {
      return resultado;
    }
    if (vistos.has(token)) {
      throw new ZoomApiError("PAGINACION_REPETIDA", "agenda-cuenta");
    }
    vistos.add(token);
  }
  throw new ZoomApiError("RESPUESTA_INCOMPLETA", "agenda-cuenta");
}

export type DetalleReunionPasadaZoom = Readonly<{
  inicio: Date | null;
  fin: Date | null;
  duracionMinutos: number | null;
  participantesReportados: number | null;
}>;

/** Consulta el UUID de una ocurrencia, nunca el número compartido de una serie. */
export async function obtenerDetalleReunionPasadaZoom(
  auth: AutenticacionZoom,
  uuid: string
): Promise<DetalleReunionPasadaZoom | null> {
  const respuesta = await pedirZoom(auth, "reunion-pasada", (accessToken) =>
    fetch(`${API}/past_meetings/${codificarUuidZoom(uuid)}`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      cache: "no-store",
      signal: AbortSignal.timeout(12000)
    })
  );
  if (respuesta.status === 404) {
    await respuesta.body?.cancel();
    return null;
  }
  if (!respuesta.ok) {
    throw await errorPorRespuesta("reunion-pasada", respuesta);
  }
  const datos = (await respuesta.json()) as Record<string, unknown>;
  const fecha = (valor: unknown) => {
    const date = typeof valor === "string" ? new Date(valor) : null;
    return date && Number.isFinite(date.getTime()) ? date : null;
  };
  const inicio = fecha(datos.start_time);
  const fin = fecha(datos.end_time);
  // `duration` puede ser la duración programada; el tiempo transcurrido lo dan inicio y fin reales.
  const duracionMinutos =
    inicio && fin ? Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60000)) : null;
  return {
    inicio,
    fin,
    duracionMinutos,
    participantesReportados: typeof datos.participants_count === "number" ? datos.participants_count : null
  };
}

/** Consulta el video o audio en la nube sin devolver enlaces de descarga ni credenciales. */
export async function consultarGrabacionOcurrenciaZoom(auth: AutenticacionZoom, uuid: string) {
  const response = await pedirZoom(auth, "grabacion-pasada", (token) =>
    fetch(`${API}/meetings/${codificarUuidZoom(uuid)}/recordings`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    })
  );
  if (response.status === 404) {
    const error = (await response.json().catch(() => null)) as { code?: number } | null;
    return error?.code === 3301 ? "SIN_ARCHIVOS" : "SIN_CONFIRMAR";
  }
  if (!response.ok) {
    throw await errorPorRespuesta("grabacion-pasada", response);
  }
  const data = (await response.json()) as {
    recording_files?: Array<{ file_type?: string; status?: string }>;
  };
  const archivos = data.recording_files?.filter(({ file_type }) =>
    ["MP4", "M4A", "MP3"].includes(file_type?.toUpperCase() ?? "")
  );
  if (archivos?.some(({ status }) => status === "completed")) {
    return "EN_ZOOM";
  }
  return archivos?.some(({ status }) => status === "processing") ? "PROCESANDO" : "SIN_CONFIRMAR";
}
