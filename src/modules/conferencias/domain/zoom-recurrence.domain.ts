import type { ZoomRecurrenceInput } from "@/src/integrations/zoom/zoom-client";

export const MAX_ZOOM_OCCURRENCES = 50;

export type InstanciaHorario = Readonly<{
  inicio: Date;
  fin?: Date;
}>;

export type RecurrenciaZoomCalculada = Readonly<{
  startTime: Date;
  durationMinutes: number;
  recurrence: ZoomRecurrenceInput;
}>;

const MAPA_DIAS_ZOOM: Readonly<Record<string, number>> = {
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
  Sat: 7
};

function obtenerDiaZoom(fecha: Date, timezone: string): number {
  const diaTexto = new Intl.DateTimeFormat("en-US", { timeZone: timezone, weekday: "short" }).format(fecha);
  return MAPA_DIAS_ZOOM[diaTexto] ?? 1;
}

function ordenarInstancias(
  items: readonly Readonly<{ inicio: Date; fin: Date }>[]
): readonly Readonly<{ inicio: Date; fin: Date }>[] {
  return items.reduce<readonly Readonly<{ inicio: Date; fin: Date }>[]>((orden, actual) => {
    const indice = orden.findIndex((item) => actual.inicio.getTime() < item.inicio.getTime());
    return indice < 0
      ? [...orden, actual]
      : [...orden.slice(0, indice), actual, ...orden.slice(indice)];
  }, []);
}

function ordenarNumeros(items: readonly number[]): readonly number[] {
  return items.reduce<readonly number[]>((orden, actual) => {
    const indice = orden.findIndex((item) => actual < item);
    return indice < 0
      ? [...orden, actual]
      : [...orden.slice(0, indice), actual, ...orden.slice(indice)];
  }, []);
}

export function calcularRecurrenciaZoom(
  instancias: readonly Readonly<{ inicio: Date; fin: Date }>[],
  timezone: string
): RecurrenciaZoomCalculada {
  if (instancias.length === 0) {
    throw new Error("La lista de instancias no puede estar vacía.");
  }
  if (instancias.length > MAX_ZOOM_OCCURRENCES) {
    throw new Error(`Una serie recurrente de Zoom no puede superar las ${MAX_ZOOM_OCCURRENCES} ocurrencias.`);
  }

  const ordenadas = ordenarInstancias(instancias);
  const primera = ordenadas[0];
  const duracionMs = primera.fin.getTime() - primera.inicio.getTime();
  const durationMinutes = Math.max(1, Math.round(duracionMs / 60_000));

  const dias = ordenadas.map((inst) => obtenerDiaZoom(inst.inicio, timezone));
  const diasUnicos = dias.filter((val, idx, arr) => arr.indexOf(val) === idx);
  const diasOrdenados = ordenarNumeros(diasUnicos);
  const weeklyDays = diasOrdenados.join(",");

  return {
    startTime: primera.inicio,
    durationMinutes,
    recurrence: {
      type: 2, // Semanal
      repeatInterval: 1,
      weeklyDays,
      endTimes: ordenadas.length
    }
  };
}

export function detectarOcurrenciasSobrantes(
  ocurrenciasZoom: readonly Readonly<{ occurrenceId: string; startTime: string }>[],
  instanciasRequeridas: readonly Readonly<{ inicio: Date }>[],
  _timezone: string
): readonly string[] {
  const TOLERANCIA_MS = 15 * 60 * 1000; // 15 minutos de tolerancia
  const tiemposRequeridos = instanciasRequeridas.map((inst) => inst.inicio.getTime());

  return ocurrenciasZoom
    .filter((occ) => {
      const zoomTime = new Date(occ.startTime).getTime();
      const coincide = tiemposRequeridos.some((reqTime) => Math.abs(zoomTime - reqTime) <= TOLERANCIA_MS);
      return !coincide;
    })
    .map((occ) => occ.occurrenceId);
}
