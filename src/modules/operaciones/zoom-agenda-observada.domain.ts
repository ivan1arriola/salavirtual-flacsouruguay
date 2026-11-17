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
}>;

export type InconsistenciasAgendaZoom = Readonly<{
  /** Reuniones que existen en Zoom y la app no creó (ni conoce). */
  externas: ReadonlyArray<
    Readonly<{ observada: ObservadaAgendaZoom; choques: readonly ReunionZoomAuditable[] }>
  >;
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
  const externas = activas
    .filter(({ meetingId }) => !idsPropios.has(meetingId))
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
  const clasificadas = reuniones.flatMap((reunion): readonly Clasificada[] => {
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
  return { externas, eliminadasEnZoom, horarioDistinto };
}
