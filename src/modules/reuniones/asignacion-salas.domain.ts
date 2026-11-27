export type SalaDisponible = Readonly<{
  id: string;
  prioridad: number;
}>;

export type ReunionParaAsignar = Readonly<{
  id: string;
  serieId: string;
  inicio: Date;
  fin: Date;
}>;

export type AsignacionSala = Readonly<{
  reunionId: string;
  salaId: string;
}>;

export type ResultadoAsignacionSalas =
  | Readonly<{ ok: true; asignaciones: readonly AsignacionSala[] }>
  | Readonly<{ ok: false; reunionIdsSinSala: readonly string[] }>;

type EstadoAsignacionAsistenciaTecnica = Readonly<{
  salas: readonly Readonly<{ id: string; prioridad: number; disponibleDesde: number }>[];
  series: readonly Readonly<{ serieId: string; salaId: string }>[];
  asignaciones: readonly AsignacionSala[];
  sinSala: readonly string[];
}>;

export function asignarSalas(
  reuniones: readonly ReunionParaAsignar[],
  salas: readonly SalaDisponible[],
): ResultadoAsignacionSalas {
  const initial: EstadoAsignacionAsistenciaTecnica = {
    salas: ordenar(
      salas.map((sala) => ({
        ...sala,
        disponibleDesde: Number.NEGATIVE_INFINITY,
      })),
      (left, right) => left.prioridad - right.prioridad,
    ),
    series: [],
    asignaciones: [],
    sinSala: [],
  };
  const result = ordenar(
    reuniones,
    (left, right) =>
      left.inicio.getTime() - right.inicio.getTime() ||
      left.fin.getTime() - right.fin.getTime() ||
      left.id.localeCompare(right.id),
  ).reduce(asignarSiguiente, initial);

  return result.sinSala.length
    ? { ok: false, reunionIdsSinSala: result.sinSala }
    : { ok: true, asignaciones: result.asignaciones };
}

function ordenar<T>(values: readonly T[], compare: (left: T, right: T) => number): readonly T[] {
  return values.reduce<readonly T[]>((ordered, value) => {
    const position = ordered.findIndex((current) => compare(value, current) < 0);
    return position < 0
      ? [...ordered, value]
      : [...ordered.slice(0, position), value, ...ordered.slice(position)];
  }, []);
}

function asignarSiguiente(
  state: EstadoAsignacionAsistenciaTecnica,
  meeting: ReunionParaAsignar,
): EstadoAsignacionAsistenciaTecnica {
  const available = state.salas.filter((room) => room.disponibleDesde <= meeting.inicio.getTime());
  const preferredId = state.series.find((series) => series.serieId === meeting.serieId)?.salaId;
  const selected = available.find((room) => room.id === preferredId) ?? available[0];
  if (!selected) {
    return { ...state, sinSala: [...state.sinSala, meeting.id] };
  }

  return {
    salas: state.salas.map((room) =>
      room.id === selected.id ? { ...room, disponibleDesde: meeting.fin.getTime() } : room,
    ),
    series: preferredId
      ? state.series
      : [...state.series, { serieId: meeting.serieId, salaId: selected.id }],
    asignaciones: [...state.asignaciones, { reunionId: meeting.id, salaId: selected.id }],
    sinSala: state.sinSala,
  };
}
