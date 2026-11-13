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
  const series = reuniones.reduce((grupos, reunion) => {
    grupos.set(reunion.solicitudId, [...(grupos.get(reunion.solicitudId) ?? []), reunion]);
    return grupos;
  }, new Map<string, ReunionZoomAuditable[]>());
  return [...series.entries()].flatMap(([solicitudId, encuentros]) => {
    if (encuentros.length < 2) {
      return [];
    }
    const ids = new Set(encuentros.map(({ meetingId }) => meetingId).filter(Boolean));
    const cuentas = new Set(encuentros.map(({ cuentaId }) => cuentaId).filter(Boolean));
    const motivos: IncidenciaSerieZoom["motivos"][number][] = [];
    if (encuentros.some(({ meetingId, cuentaId }) => !meetingId || !cuentaId)) {
      motivos.push("SIN_REUNION");
    }
    if (ids.size > 1) {
      motivos.push("IDS_DISTINTOS");
    }
    if (cuentas.size > 1) {
      motivos.push("CUENTAS_DISTINTAS");
    }
    return motivos.length
      ? [
          {
            solicitudId,
            titulo: encuentros[0].titulo,
            inicio: encuentros[0].inicio,
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
  const ordenadas = [...reuniones].sort((a, b) => a.inicio.getTime() - b.inicio.getTime());
  const solapes: SolapeCuentaZoom[] = [];
  for (const [indice, primera] of ordenadas.entries()) {
    if (!primera.cuentaId) {
      continue;
    }
    for (const segunda of ordenadas.slice(indice + 1)) {
      if (segunda.inicio >= primera.fin) {
        break;
      }
      if (segunda.cuentaId === primera.cuentaId && primera.inicio < segunda.fin) {
        solapes.push({ cuentaId: primera.cuentaId, primera, segunda });
      }
    }
  }
  return solapes;
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
