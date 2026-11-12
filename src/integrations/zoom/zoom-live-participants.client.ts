export type ParticipanteZoomEnVivo = Readonly<{
  id: string;
  nombre: string;
  email: string | null;
  ingreso: string | null;
}>;

export type EstadoAsistenciaZoomEnVivo =
  | { estado: "DISPONIBLE"; participantes: readonly ParticipanteZoomEnVivo[] }
  | { estado: "NO_DISPONIBLE"; motivo: "SIN_REUNION" | "SIN_PERMISOS" | "SIN_DATOS" };

/**
 * Zoom Dashboard API: requiere plan y permisos de dashboard.
 * Nunca convierte errores de permisos o una reunión no iniciada en cero asistentes.
 */
export async function obtenerParticipantesZoomEnVivoHttp(
  token: string,
  meetingId: string
): Promise<EstadoAsistenciaZoomEnVivo> {
  const participantes: ParticipanteZoomEnVivo[] = [];
  let siguiente = "";
  const visitados = new Set<string>();
  do {
    const params = new URLSearchParams({ type: "live", page_size: "300" });
    if (siguiente) {
      params.set("next_page_token", siguiente);
    }
    const response = await fetch(
      `https://api.zoom.us/v2/metrics/meetings/${encodeURIComponent(meetingId)}/participants?${params}`,
      { headers: { Authorization: `Bearer ${token}` }, cache: "no-store", signal: AbortSignal.timeout(8000) }
    );
    if (response.status === 403 || response.status === 401) {
      return { estado: "NO_DISPONIBLE", motivo: "SIN_PERMISOS" };
    }
    if (response.status === 404) {
      return { estado: "NO_DISPONIBLE", motivo: "SIN_REUNION" };
    }
    if (!response.ok) {
      throw new Error(`Zoom Dashboard API (${response.status})`);
    }
    const data = (await response.json()) as {
      participants?: Array<{
        id?: string;
        user_id?: string;
        user_name?: string;
        name?: string;
        email?: string;
        user_email?: string;
        join_time?: string;
      }>;
      next_page_token?: string;
    };
    for (const p of data.participants ?? []) {
      participantes.push({
        id:
          p.id || p.user_id || `${p.user_name || p.name || "anonimo"}:${p.join_time || participantes.length}`,
        nombre: p.user_name || p.name || "Sin nombre",
        email: p.email?.trim() || p.user_email?.trim() || null,
        ingreso: p.join_time || null
      });
    }
    siguiente = data.next_page_token ?? "";
    if (siguiente && visitados.has(siguiente)) {
      throw new Error("Paginación repetida en Zoom Dashboard");
    }
    if (siguiente) {
      visitados.add(siguiente);
    }
  } while (siguiente);
  return { estado: "DISPONIBLE", participantes };
}
