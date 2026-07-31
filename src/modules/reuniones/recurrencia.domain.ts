export type FechaRecurrente = Readonly<{
  fecha: string;
  horaInicio: string;
  horaFin: string;
}>;

export type ReglaRecurrencia = Readonly<{
  desde: string;
  hasta: string;
  diasSemana: readonly number[];
  horaInicio: string;
  horaFin: string;
}>;

const MILISEGUNDOS_DIA = 24 * 60 * 60 * 1000;
const MAXIMO_ENCUENTROS = 366;

export function generarFechasRecurrentes(regla: ReglaRecurrencia): readonly FechaRecurrente[] {
  const inicio = fechaIsoAUTC(regla.desde);
  const fin = fechaIsoAUTC(regla.hasta);
  if (!Number.isFinite(inicio) || !Number.isFinite(fin) || fin < inicio) {
    throw new Error("El rango de fechas no es valido.");
  }
  if (regla.diasSemana.length === 0) throw new Error("Selecciona al menos un dia de la semana.");
  if (!regla.horaInicio || !regla.horaFin || regla.horaFin <= regla.horaInicio) {
    throw new Error("La hora de fin debe ser posterior a la hora de inicio.");
  }

  const cantidadDias = Math.floor((fin - inicio) / MILISEGUNDOS_DIA) + 1;
  if (cantidadDias > MAXIMO_ENCUENTROS) throw new Error("El rango no puede superar un ano.");
  const diasElegidos = new Set(regla.diasSemana);

  return Array.from({ length: cantidadDias }, (_, index) => inicio + index * MILISEGUNDOS_DIA)
    .filter((timestamp) => diasElegidos.has(diaSemanaUTC(timestamp)))
    .map((timestamp) => ({
      fecha: timestampAFechaIso(timestamp),
      horaInicio: regla.horaInicio,
      horaFin: regla.horaFin
    }));
}

function fechaIsoAUTC(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return year && month && day ? Date.UTC(year, month - 1, day) : Number.NaN;
}

function diaSemanaUTC(timestamp: number): number {
  return ((Math.floor(timestamp / MILISEGUNDOS_DIA) + 4) % 7 + 7) % 7;
}

function timestampAFechaIso(timestamp: number): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(timestamp);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}
