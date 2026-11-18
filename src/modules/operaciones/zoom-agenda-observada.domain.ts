import type { ReunionZoomAuditable } from "./zoom-diagnostico.domain";

export type ObservadaAgendaZoom = Readonly<{
  id: string;
  meetingId: string;
  ocurrenciaZoomId: string;
  cuentaProveedorId: string | null;
  tema: string;
  inicio: Date;
  fin: Date;
  estado: string;
  /** Si un administrador la ignoró, no cuenta como choque ni como diferencia. */
  ignoradaAt?: Date | null;
}>;

export type InconsistenciasAgendaZoom = Readonly<{
  /** Reuniones que existen en Zoom y la app no creó (ni conoce). */
  externas: ReadonlyArray<
    Readonly<{ observada: ObservadaAgendaZoom; choques: readonly ReunionZoomAuditable[] }>
  >;
  /** Reuniones externas ignoradas a propósito (solo para poder dejar de ignorarlas). */
  ignoradas: readonly ObservadaAgendaZoom[];
  /** Encuentros de la app cuya reunión Zoom fue eliminada allá. */
  eliminadasEnZoom: readonly ReunionZoomAuditable[];
  /** Encuentros de la app cuyo horario no coincide con ninguna ocurrencia vigente en Zoom. */
  horarioDistinto: ReadonlyArray<
    Readonly<{ reunion: ReunionZoomAuditable; enZoom: readonly ObservadaAgendaZoom[] }>
  >;
}>;

type Clasificada = Readonly<{
  tipo: "ELIMINADA" | "HORARIO";
  reunion: ReunionZoomAuditable;
  enZoom: readonly ObservadaAgendaZoom[];
}>;

const TOLERANCIA_MS = 60_000;
const seSolapan = (a: Readonly<{ inicio: Date; fin: Date }>, b: Readonly<{ inicio: Date; fin: Date }>) =>
  a.inicio < b.fin && b.inicio < a.fin;

/**
 * Contrasta el espejo de Zoom con la agenda de la app. `idsPropios` son todas las reuniones Zoom que la app
 * conoce (también las pasadas o canceladas): lo demás se considera creado directamente en Zoom.
 */
export function detectarInconsistenciasAgendaZoom(
  observadas: readonly ObservadaAgendaZoom[],
  reuniones: readonly ReunionZoomAuditable[],
  idsPropios: ReadonlySet<string>,
  ahora: Date
): InconsistenciasAgendaZoom {
  const futuras = observadas.filter(({ fin }) => fin > ahora);
  const activas = futuras.filter(({ estado }) => estado === "ACTIVA");
  const sinVincular = activas.filter(({ meetingId }) => !idsPropios.has(meetingId));
  const ignoradas = sinVincular.filter(({ ignoradaAt }) => Boolean(ignoradaAt));
  const externas = sinVincular
    .filter(({ ignoradaAt }) => !ignoradaAt)
    .map((observada) => ({
      observada,
      choques: reuniones.filter(
        (reunion) =>
          reunion.cuentaId !== null &&
          reunion.cuentaId === observada.cuentaProveedorId &&
          seSolapan(reunion, observada)
      )
    }));

  const porReunion = futuras
    .filter(({ meetingId }) => idsPropios.has(meetingId))
    .reduce<Readonly<Record<string, readonly ObservadaAgendaZoom[]>>>(
      (grupos, fila) => ({ ...grupos, [fila.meetingId]: [...(grupos[fila.meetingId] ?? []), fila] }),
      {}
    );
  // Solo encuentros que todavía no empezaron: lo transcurrido o en curso nunca se marca.
  const clasificadas = reuniones
    .filter(({ inicio }) => inicio > ahora)
    .flatMap((reunion): readonly Clasificada[] => {
      const filas = reunion.meetingId ? (porReunion[reunion.meetingId] ?? []) : [];
      const vigentes = filas.filter(({ estado }) => estado === "ACTIVA");
      if (filas.length === 0) {
        return [];
      }
      if (vigentes.length === 0) {
        return [{ tipo: "ELIMINADA", reunion, enZoom: vigentes }];
      }
      const coincide = vigentes.some(
        ({ inicio }) => Math.abs(inicio.getTime() - reunion.inicio.getTime()) <= TOLERANCIA_MS
      );
      return coincide ? [] : [{ tipo: "HORARIO", reunion, enZoom: vigentes }];
    });
  const eliminadasEnZoom = clasificadas.flatMap((c) => (c.tipo === "ELIMINADA" ? [c.reunion] : []));
  const horarioDistinto = clasificadas.flatMap((c) =>
    c.tipo === "HORARIO" ? [{ reunion: c.reunion, enZoom: c.enZoom }] : []
  );
  return { externas, ignoradas, eliminadasEnZoom, horarioDistinto };
}

export type OcurrenciaElegida =
  Readonly<{ ok: true; ocurrencia: ObservadaAgendaZoom }> | Readonly<{ ok: false; motivo: string }>;

/**
 * Ocurrencia de Zoom que corresponde a un encuentro con horario distinto: la vigente más cercana.
 * Si esa ocurrencia ya coincide con otro encuentro de la misma reunión, no se adivina: se rechaza.
 */
export function elegirOcurrenciaDelEncuentro(
  reunion: ReunionZoomAuditable,
  enZoom: readonly ObservadaAgendaZoom[],
  reuniones: readonly ReunionZoomAuditable[]
): OcurrenciaElegida {
  const distancia = (o: ObservadaAgendaZoom) => Math.abs(o.inicio.getTime() - reunion.inicio.getTime());
  const ocurrencia = enZoom.reduce<ObservadaAgendaZoom | null>(
    (mejor, o) => (!mejor || distancia(o) < distancia(mejor) ? o : mejor),
    null
  );
  if (!ocurrencia) {
    return { ok: false, motivo: "Zoom no informa ninguna ocurrencia vigente de esta reunión." };
  }
  const ocupada = reuniones.some(
    (otra) =>
      otra.instanciaId !== reunion.instanciaId &&
      otra.meetingId === reunion.meetingId &&
      Math.abs(otra.inicio.getTime() - ocurrencia.inicio.getTime()) <= TOLERANCIA_MS
  );
  return ocupada
    ? { ok: false, motivo: "La ocurrencia de Zoom más cercana corresponde a otro encuentro de la serie." }
    : { ok: true, ocurrencia };
}
