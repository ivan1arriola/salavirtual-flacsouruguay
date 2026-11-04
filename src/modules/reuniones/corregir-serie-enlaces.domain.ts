import { elegirCuentaHostParaPeriodos } from "./encuentros.domain";

export type EncuentroSerieParaCorregir = Readonly<{
  instanciaId: string;
  inicio: Date;
  fin: Date;
  joinUrl: string | null;
  externalEventId: string | null;
  cuentaProveedorId: string | null;
  calendarId: string | null;
  calendarEventId: string | null;
}>;

export type PlanCorreccionSerie = Readonly<{
  estado: "CORREGIBLE" | "SIN_SALA" | "CERCANO" | "REVISAR";
  hostId: string | null;
  encuentroIds: readonly string[];
  /** IDs de las reuniones Zoom antiguas (distintos y no nulos) que se retiran 7 días después. */
  reunionesARetirar: readonly string[];
  /** Encuentros sin cita de Calendar: no bloquean, solo cambian en Sala Virtual. */
  encuentrosSinCalendar: readonly string[];
}>;

type Host = Readonly<{ id: string; prioridad: number; limiteConcurrente: number | null }>;
type ReservaZoom = Readonly<{ cuentaProveedorId: string; inicio: Date; fin: Date; instanciaId?: string }>;

const unicos = <T>(valores: readonly T[]): readonly T[] => [...new Set(valores)];

/** La cuenta que ya usan más encuentros de la serie, solo entre las salas disponibles; empata por orden de `hosts`. */
function cuentaMasUsada(encuentros: readonly EncuentroSerieParaCorregir[], hosts: readonly Host[]): string | null {
  const usos = (id: string) => encuentros.filter(({ cuentaProveedorId }) => cuentaProveedorId === id).length;
  const [elegida] = hosts.reduce<readonly Host[]>(
    (ordenados, host) => {
      const posicion = ordenados.findIndex((otro) => usos(host.id) > usos(otro.id));
      return posicion < 0
        ? [...ordenados, host]
        : [...ordenados.slice(0, posicion), host, ...ordenados.slice(posicion)];
    },
    [],
  );
  return elegida && usos(elegida.id) > 0 ? elegida.id : null;
}

/**
 * Plan para unificar una serie en una sola reunión Zoom compartida. Función pura: no consulta
 * ni escribe. `encuentros` son los futuros y programados (o en curso) de la serie, ya sin
 * cancelados; las reservas de la propia serie no cuentan como colisión.
 */
export function planificarCorreccionSerie(input: Readonly<{
  ahora: Date;
  margenSeguridadHoras: number;
  encuentros: readonly EncuentroSerieParaCorregir[];
  hosts: readonly Host[];
  reservasZoom: readonly (ReservaZoom)[];
}>): PlanCorreccionSerie {
  const vigentes = input.encuentros.filter(({ fin }) => fin > input.ahora);
  const encuentroIds = vigentes.map(({ instanciaId }) => instanciaId);
  const base = {
    encuentroIds,
    reunionesARetirar: unicos(vigentes.flatMap(({ externalEventId }) => (externalEventId ? [externalEventId] : []))),
    encuentrosSinCalendar: vigentes
      .filter(({ calendarId, calendarEventId }) => !calendarId || !calendarEventId)
      .map(({ instanciaId }) => instanciaId),
  };
  if (vigentes.length === 0) return { ...base, estado: "REVISAR", hostId: null };

  const limiteCercano = input.ahora.getTime() + Math.max(0, input.margenSeguridadHoras) * 3_600_000;
  if (vigentes.some(({ inicio }) => inicio.getTime() <= limiteCercano)) {
    return { ...base, estado: "CERCANO", hostId: null };
  }

  const propios = new Set(encuentroIds);
  const reservasAjenas = input.reservasZoom.filter(({ instanciaId }) => !instanciaId || !propios.has(instanciaId));
  const hostId = elegirCuentaHostParaPeriodos(
    cuentaMasUsada(vigentes, input.hosts),
    input.hosts,
    reservasAjenas,
    vigentes.map(({ inicio, fin }) => ({ inicio, fin })),
  );
  return hostId
    ? { ...base, estado: "CORREGIBLE", hostId }
    : { ...base, estado: "SIN_SALA", hostId: null };
}
