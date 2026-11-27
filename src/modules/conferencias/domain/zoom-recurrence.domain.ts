import type { ZoomRecurrenceInput } from "@/src/integrations/zoom/zoom-client";

export const MAX_ZOOM_OCCURRENCES = 50;

export type RecurrenciaZoomCalculada = Readonly<{
  startTime: Date;
  durationMinutes: number;
  recurrence: ZoomRecurrenceInput;
}>;

export type OcurrenciaAjuste = Readonly<{
  occurrenceId: string;
  startTime: Date;
  durationMinutes: number;
}>;

const MAPA_DIAS_ZOOM: Readonly<Record<string, number>> = {
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
  Sat: 7,
};

function obtenerDiaZoom(fecha: Date, timezone: string): number {
  const diaTexto = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(fecha);
  return MAPA_DIAS_ZOOM[diaTexto] ?? 1;
}

function obtenerPartesFecha(fecha: Date, timezone: string): readonly [number, number, number] {
  const formateador = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  });
  const partes = formateador.formatToParts(fecha);
  const anio = Number(partes.find((p) => p.type === "year")?.value ?? "0");
  const mes = Number(partes.find((p) => p.type === "month")?.value ?? "0");
  const dia = Number(partes.find((p) => p.type === "day")?.value ?? "0");
  return [anio, mes, dia];
}

function formatearFechaIso(fecha: Date, timezone: string): string {
  const [anio, mes, dia] = obtenerPartesFecha(fecha, timezone);
  const m = String(mes).padStart(2, "0");
  const d = String(dia).padStart(2, "0");
  return `${anio}-${m}-${d}`;
}

function ordenarInstancias(
  items: readonly Readonly<{ inicio: Date; fin: Date }>[],
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

/**
 * Calcula la cantidad exacta de slots que Zoom generará en el calendario semanal
 * desde la primera fecha hasta la última, asegurando que Zoom cubra toda la serie
 * aun cuando haya feriados o huecos intermedios.
 */
export function calcularSlotsZoom(
  primeraFecha: Date,
  ultimaFecha: Date,
  diasZoomValidos: readonly number[],
  timezone: string,
): number {
  const diaInicio = obtenerDiaZoom(primeraFecha, timezone);
  const [y1, m1, d1] = obtenerPartesFecha(primeraFecha, timezone);
  const [y2, m2, d2] = obtenerPartesFecha(ultimaFecha, timezone);

  const utcInicio = Date.UTC(y1, m1 - 1, d1);
  const utcFin = Date.UTC(y2, m2 - 1, d2);
  const diffDias = Math.max(0, Math.round((utcFin - utcInicio) / 86_400_000));

  return Array.from({ length: diffDias + 1 }, (_, i) => i).filter((i) => {
    const diaActual = ((diaInicio - 1 + i) % 7) + 1;
    return diasZoomValidos.includes(diaActual);
  }).length;
}

export function calcularRecurrenciaZoom(
  instancias: readonly Readonly<{ inicio: Date; fin: Date }>[],
  timezone: string,
): RecurrenciaZoomCalculada {
  if (instancias.length === 0) {
    throw new Error("La lista de instancias no puede estar vacía.");
  }
  if (instancias.length > MAX_ZOOM_OCCURRENCES) {
    throw new Error(
      `Una serie recurrente de Zoom no puede superar las ${MAX_ZOOM_OCCURRENCES} ocurrencias.`,
    );
  }

  const ordenadas = ordenarInstancias(instancias);
  const primera = ordenadas[0];
  const ultima = ordenadas.at(-1);
  if (!primera || !ultima) {
    throw new Error("La lista de instancias no puede estar vacía.");
  }
  const duracionMs = primera.fin.getTime() - primera.inicio.getTime();
  const durationMinutes = Math.max(1, Math.round(duracionMs / 60_000));

  const dias = ordenadas.map((inst) => obtenerDiaZoom(inst.inicio, timezone));
  const diasUnicos = dias.filter((val, idx, arr) => arr.indexOf(val) === idx);
  const diasOrdenados = ordenarNumeros(diasUnicos);
  const weeklyDays = diasOrdenados.join(",");

  const endTimes = calcularSlotsZoom(primera.inicio, ultima.inicio, diasOrdenados, timezone);
  if (endTimes > MAX_ZOOM_OCCURRENCES) {
    throw new Error(
      `Una serie recurrente de Zoom no puede superar las ${MAX_ZOOM_OCCURRENCES} ocurrencias en Zoom (requiere ${endTimes} slots semanales).`,
    );
  }

  return {
    startTime: primera.inicio,
    durationMinutes,
    recurrence: {
      type: 2, // Semanal
      repeatInterval: 1,
      weeklyDays,
      endTimes,
    },
  };
}

export function detectarOcurrenciasSobrantes(
  ocurrenciasZoom: readonly Readonly<{ occurrenceId: string; startTime: string }>[],
  instanciasRequeridas: readonly Readonly<{ inicio: Date }>[],
  timezone: string,
): readonly string[] {
  const fechasRequeridas = instanciasRequeridas.map((inst) =>
    formatearFechaIso(inst.inicio, timezone),
  );

  return ocurrenciasZoom
    .filter((occ) => {
      const zoomDateIso = formatearFechaIso(new Date(occ.startTime), timezone);
      return !fechasRequeridas.includes(zoomDateIso);
    })
    .map((occ) => occ.occurrenceId);
}

export function detectarOcurrenciasAjustar(
  ocurrenciasZoom: readonly Readonly<{
    occurrenceId: string;
    startTime: string;
    duration?: number;
  }>[],
  instanciasRequeridas: readonly Readonly<{ inicio: Date; fin: Date }>[],
  timezone: string,
): readonly OcurrenciaAjuste[] {
  return ocurrenciasZoom.flatMap((occ) => {
    const zoomDate = new Date(occ.startTime);
    const zoomDateIso = formatearFechaIso(zoomDate, timezone);
    const instanciaCoincidente = instanciasRequeridas.find(
      (inst) => formatearFechaIso(inst.inicio, timezone) === zoomDateIso,
    );
    if (!instanciaCoincidente) {
      return [];
    }

    const instDuracionMinutos = Math.max(
      1,
      Math.round(
        (instanciaCoincidente.fin.getTime() - instanciaCoincidente.inicio.getTime()) / 60_000,
      ),
    );
    const diferenciaInicioMs = Math.abs(zoomDate.getTime() - instanciaCoincidente.inicio.getTime());
    const diferenciaDuracionMinutos = occ.duration
      ? Math.abs(occ.duration - instDuracionMinutos)
      : 0;

    // Si difiere en hora de inicio (más de 1 min) o duración (más de 1 min), requiere ajuste
    if (diferenciaInicioMs > 60_000 || diferenciaDuracionMinutos > 1) {
      return [
        {
          occurrenceId: occ.occurrenceId,
          startTime: instanciaCoincidente.inicio,
          durationMinutes: instDuracionMinutos,
        },
      ];
    }
    return [];
  });
}
