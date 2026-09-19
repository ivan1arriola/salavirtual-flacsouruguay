import type { PeriodoMes, PeriodoReporteMensual, ResumenAsistencia } from "./liquidaciones.types";

const utc3PartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit"
});

function yearAndMonthUtc3(fecha: Date): Readonly<{ year: number; month: number }> {
  const parts = utc3PartsFormatter.formatToParts(fecha);
  const value = (type: "year" | "month") =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month") };
}

export function rangoMesUtc3(fecha: Date): Readonly<{ desdeMs: number; hastaMs: number }> {
  const { year, month } = yearAndMonthUtc3(fecha);
  return {
    desdeMs: Date.UTC(year, month - 1, 1, 3),
    hastaMs: Date.UTC(year, month, 1, 3)
  };
}

export function claveMesUtc3(fecha: Date): string {
  const { year, month } = yearAndMonthUtc3(fecha);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function calcularMinutos(
  programado: Readonly<{ inicio: Date; fin: Date }>,
  confirmado: number | null,
  reportado: number | null,
  real: Readonly<{ inicio: Date | null; fin: Date | null }>
): number {
  if (confirmado !== null) return Math.max(0, confirmado);
  if (reportado !== null) return Math.max(0, reportado);
  const inicio = real.inicio ?? programado.inicio;
  const fin = real.fin ?? programado.fin;
  return Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60_000));
}

export function calcularMonto(
  montoConfirmado: number | null,
  tarifaHora: number | null,
  minutos: number
): number | null {
  if (montoConfirmado !== null) return montoConfirmado;
  return tarifaHora === null ? null : (tarifaHora * minutos) / 60;
}

export function resolverPeriodoMes(valor: string | undefined, ahora: Date): PeriodoMes {
  const fallback = claveMesUtc3(ahora);
  const clave = valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : fallback;
  const [year, month] = clave.split("-").map(Number);
  return {
    clave,
    desdeMs: Date.UTC(year, month - 1, 1, 3),
    hastaMs: Date.UTC(year, month, 1, 3),
    anterior: claveDesdeUtc(year, month - 2),
    siguiente: claveDesdeUtc(year, month)
  };
}

export function periodoMesAnteriorUtc3(ahora: Date): PeriodoReporteMensual {
  const [yearText, monthText] = claveMesUtc3(ahora).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  return {
    clave: `${previousYear}-${String(previousMonth).padStart(2, "0")}`,
    desdeMs: Date.UTC(previousYear, previousMonth - 1, 1, 3),
    hastaMs: Date.UTC(year, month - 1, 1, 3)
  };
}

export function minutosTotales(resumen: ResumenAsistencia): number {
  return resumen.minutosVirtuales + resumen.minutosHibridos;
}

export function formatearDuracion(minutos: number): string {
  const total = Math.max(0, Math.round(minutos));
  const horas = Math.floor(total / 60);
  const resto = total % 60;
  if (resto === 0) return `${horas} h`;
  return `${horas} h ${resto} min`;
}

export function formatearHorasDecimales(minutos: number): string {
  return (Math.max(0, minutos) / 60).toFixed(2).replace(".", ",");
}

export function etiquetaMes(periodo: string): string {
  const [yearText, monthText] = periodo.split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  if (!Number.isInteger(year) || !Number.isInteger(month) || month < 1 || month > 12) {
    return periodo;
  }
  return new Intl.DateTimeFormat("es-UY", {
    month: "long",
    year: "numeric",
    timeZone: "America/Montevideo"
  }).format(Date.UTC(year, month - 1, 15, 12));
}

function claveDesdeUtc(year: number, zeroBasedMonth: number): string {
  const absoluteMonth = year * 12 + zeroBasedMonth;
  const normalizedYear = Math.floor(absoluteMonth / 12);
  const normalizedMonth = absoluteMonth - normalizedYear * 12;
  return `${normalizedYear}-${String(normalizedMonth + 1).padStart(2, "0")}`;
}
