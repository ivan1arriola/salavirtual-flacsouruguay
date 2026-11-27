export type ReunionZoomAuditable = Readonly<{
  instanciaId: string;
  solicitudId: string;
  titulo: string;
  inicio: Date;
  fin: Date;
  cuentaId: string | null;
  meetingId: string | null;
}>;

export type IncidenciaSerieZoom = Readonly<{
  solicitudId: string;
  titulo: string;
  inicio: Date;
  motivos: readonly ("SIN_REUNION" | "IDS_DISTINTOS" | "CUENTAS_DISTINTAS")[];
  encuentros: number;
}>;

/** Diagnóstico global: nunca modifica la serie ni infiere una cuenta o ID que faltan. */
export function auditarSeriesZoom(
  reuniones: readonly ReunionZoomAuditable[]
): readonly IncidenciaSerieZoom[] {
  const series = reuniones.reduce<Record<string, ReunionZoomAuditable[]>>(
    (grupos, reunion) => ({
      ...grupos,
      [reunion.solicitudId]: [...(grupos[reunion.solicitudId] ?? []), reunion]
    }),
    {}
  );
  return Object.entries(series).flatMap(([solicitudId, encuentros]) => {
    const primero = encuentros[0];
    if (!primero || encuentros.length < 2) {
      return [];
    }
    const ids = new Set(encuentros.map(({ meetingId }) => meetingId).filter(Boolean));
    const cuentas = new Set(encuentros.map(({ cuentaId }) => cuentaId).filter(Boolean));
    const motivos: IncidenciaSerieZoom["motivos"] = [
      ...(encuentros.some(({ meetingId, cuentaId }) => !meetingId || !cuentaId)
        ? ["SIN_REUNION" as const]
        : []),
      ...(ids.size > 1 ? ["IDS_DISTINTOS" as const] : []),
      ...(cuentas.size > 1 ? ["CUENTAS_DISTINTAS" as const] : [])
    ];
    return motivos.length
      ? [
          {
            solicitudId,
            titulo: primero.titulo,
            inicio: primero.inicio,
            motivos,
            encuentros: encuentros.length
          }
        ]
      : [];
  });
}

export type SolapeCuentaZoom = Readonly<{
  cuentaId: string;
  primera: ReunionZoomAuditable;
  segunda: ReunionZoomAuditable;
}>;

/** Intervalos semiabiertos: una clase que termina a las 10:00 libera la cuenta a las 10:00. */
export function detectarSolapesCuentasZoom(
  reuniones: readonly ReunionZoomAuditable[]
): readonly SolapeCuentaZoom[] {
  const ordenadas = reuniones.reduce<ReunionZoomAuditable[]>((acumuladas, reunion) => {
    const indice = acumuladas.findIndex(({ inicio }) => inicio > reunion.inicio);
    return indice < 0
      ? [...acumuladas, reunion]
      : [...acumuladas.slice(0, indice), reunion, ...acumuladas.slice(indice)];
  }, []);
  return ordenadas.flatMap((primera, indice): SolapeCuentaZoom[] => {
    const cuentaId = primera.cuentaId;
    return cuentaId
      ? ordenadas
          .slice(indice + 1)
          .filter(
            (segunda) =>
              segunda.inicio < primera.fin && segunda.cuentaId === cuentaId && primera.inicio < segunda.fin
          )
          .map((segunda) => ({ cuentaId, primera, segunda }))
      : [];
  });
}

export type ReunionZoomRemota = Readonly<{ meetingId: string; inicio: Date | null }>;

/** Contrasta únicamente reuniones administradas en Sala Virtual; no incorpora clases externas. */
export function compararAgendaZoom(
  locales: readonly ReunionZoomAuditable[],
  remotas: readonly ReunionZoomRemota[]
): Readonly<{ verificadas: number; ausentes: readonly ReunionZoomAuditable[] }> {
  const idsRemotos = new Set(remotas.map(({ meetingId }) => meetingId));
  const verificadas = locales.filter(({ meetingId }) => meetingId && idsRemotos.has(meetingId));
  return {
    verificadas: verificadas.length,
    ausentes: locales.filter(({ meetingId }) => meetingId && !idsRemotos.has(meetingId))
  };
}
