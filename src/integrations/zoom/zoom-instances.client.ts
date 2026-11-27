/**
 * Identifica una ocurrencia concreta de una reunión recurrente por su horario.
 * No utiliza el ID compartido para consultar asistencia histórica.
 */
export async function resolverUuidInstanciaZoomHttp(
  token: string,
  meetingId: string,
  inicioProgramado: Date,
  finProgramado: Date,
): Promise<string | null> {
  const inicio = inicioProgramado.getTime();
  const fin = finProgramado.getTime();
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin <= inicio) {
    return null;
  }
  const response = await fetch(
    `https://api.zoom.us/v2/past_meetings/${encodeURIComponent(meetingId)}/instances`,
    {
      headers: { Authorization: `Bearer ${token}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    },
  );
  if (response.status === 404) {
    return null;
  }
  if (!response.ok) {
    throw new Error(`Zoom: error al listar instancias (${response.status})`);
  }
  const data = (await response.json()) as {
    meetings?: Array<{ uuid?: string; start_time?: string }>;
  };
  const candidatas = (data.meetings ?? [])
    .map((m) => ({ uuid: m.uuid, fecha: m.start_time ? new Date(m.start_time).getTime() : NaN }))
    .filter(
      (m): m is { uuid: string; fecha: number } => Boolean(m.uuid) && Number.isFinite(m.fecha),
    )
    .filter((m) => m.fecha >= inicio - 60 * 60_000 && m.fecha <= fin);
  // No atribuir asistentes a una clase cuando hay dos ocurrencias posibles.
  return candidatas.length === 1 ? candidatas[0].uuid : null;
}
