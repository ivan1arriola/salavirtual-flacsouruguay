/** Sesiones informadas por Zoom para una instancia finalizada. */
export type ZoomSesionParticipante = Readonly<{
  participantId: string | null;
  userId: string | null;
  nombre: string;
  email: string | null;
  joinTime: Date;
  leaveTime: Date;
  /** Estado informado por Zoom; las personas en sala de espera no estuvieron en la reunión. */
  status: EstadoParticipanteZoom | null;
}>;

export type EstadoParticipanteZoom = "in_meeting" | "in_waiting_room";

function estadoParticipante(valor: unknown): EstadoParticipanteZoom | null {
  return valor === "in_meeting" || valor === "in_waiting_room" ? valor : null;
}

/**
 * Páginas del reporte de participantes EXACTAMENTE como las devolvió Zoom, sin interpretar ni filtrar nada
 * (incluye las sesiones que la consolidación descarta). null: Zoom todavía no tiene el reporte (404).
 */
export async function descargarReporteParticipantesZoomOriginalHttp(
  token: string,
  meetingUuid: string
): Promise<readonly unknown[] | null> {
  const paginas: unknown[] = [];
  const tokensVistos = new Set<string>();
  let pagina = "";
  do {
    const params = new URLSearchParams({ page_size: "300" });
    if (pagina) {
      params.set("next_page_token", pagina);
    }
    const id = encodeURIComponent(encodeURIComponent(meetingUuid));
    const response = await fetch(
      `https://api.zoom.us/v2/past_meetings/${id}/participants?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Zoom: error al consultar asistencia (${response.status})`);
    }
    const data = (await response.json()) as { next_page_token?: string };
    paginas.push(data);
    pagina = data.next_page_token ?? "";
    if (pagina && tokensVistos.has(pagina)) {
      throw new Error("Zoom devolvió una paginación repetida");
    }
    tokensVistos.add(pagina);
  } while (pagina);
  return paginas;
}

/**
 * Consulta el reporte histórico de una instancia de Zoom.
 * En reuniones recurrentes se debe pasar el UUID de la instancia, NO el ID
 * numérico compartido por toda la serie.
 *
 * null: Zoom todavía no dispone del reporte (404).
 * []: Zoom devolvió un reporte disponible sin participantes.
 */
export async function listarParticipantesReunionPasadaZoomHttp(
  token: string,
  meetingUuid: string
): Promise<readonly ZoomSesionParticipante[] | null> {
  const participantes: ZoomSesionParticipante[] = [];
  let pagina = "";
  const tokensVistos = new Set<string>();
  do {
    const params = new URLSearchParams({ page_size: "300" });
    if (pagina) {
      params.set("next_page_token", pagina);
    }
    // Los UUID con / deben codificarse dos veces, según la API de Zoom.
    const id = encodeURIComponent(encodeURIComponent(meetingUuid));
    const response = await fetch(
      `https://api.zoom.us/v2/past_meetings/${id}/participants?${params.toString()}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (response.status === 404) {
      return null;
    }
    if (!response.ok) {
      throw new Error(`Zoom: error al consultar asistencia (${response.status})`);
    }
    const data = (await response.json()) as {
      participants?: Array<{
        id?: string;
        user_id?: string;
        name?: string;
        user_email?: string;
        email?: string;
        join_time?: string;
        leave_time?: string;
        status?: string;
      }>;
      next_page_token?: string;
    };
    for (const p of data.participants ?? []) {
      if (!p.join_time || !p.leave_time) {
        continue;
      }
      const joinTime = new Date(p.join_time);
      const leaveTime = new Date(p.leave_time);
      if (!Number.isFinite(joinTime.getTime()) || !Number.isFinite(leaveTime.getTime())) {
        continue;
      }
      participantes.push({
        participantId: p.id || null,
        userId: p.user_id || null,
        nombre: p.name?.trim() || "Sin nombre",
        email: (p.user_email || p.email || "").trim() || null,
        joinTime,
        leaveTime,
        status: estadoParticipante(p.status)
      });
    }
    pagina = data.next_page_token ?? "";
    if (pagina && tokensVistos.has(pagina)) {
      throw new Error("Zoom devolvió una paginación repetida");
    }
    if (pagina) {
      tokensVistos.add(pagina);
    }
  } while (pagina);
  return participantes;
}
