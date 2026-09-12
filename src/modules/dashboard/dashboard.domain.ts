import type { EstadoTemporalReunion } from "./types";

const MINUTOS_ANTICIPACION_EN_VIVO = 15;

export function determinarEstadoTemporal(
  inicio: Date,
  fin: Date,
  ahora: Date
): EstadoTemporalReunion {
  const ahoraMs = ahora.getTime();
  const inicioMs = inicio.getTime();
  const finMs = fin.getTime();
  const umbralEnVivoMs = inicioMs - MINUTOS_ANTICIPACION_EN_VIVO * 60 * 1000;

  if (ahoraMs > finMs) {
    return "FINALIZADA";
  }
  if (ahoraMs >= umbralEnVivoMs && ahoraMs <= finMs) {
    return "EN_VIVO";
  }
  if (esMismoDiaMontevideo(inicio, ahora)) {
    return "PROXIMA_HOY";
  }
  return "FUTURA";
}

export function formatearTiempoHastaReunion(inicio: Date, ahora: Date): string {
  const diffMs = inicio.getTime() - ahora.getTime();
  if (diffMs <= 0) {
    return "En curso";
  }
  const totalMinutos = Math.floor(diffMs / (60 * 1000));
  if (totalMinutos < 60) {
    return `Empieza en ${Math.max(1, totalMinutos)} min`;
  }
  const horas = Math.floor(totalMinutos / 60);
  const minutosRestantes = totalMinutos % 60;
  if (minutosRestantes === 0) {
    return `Empieza en ${horas} h`;
  }
  return `Empieza en ${horas} h ${minutosRestantes} min`;
}

export function esMismoDiaMontevideo(a: Date, b: Date): boolean {
  const diaA = obtenerClaveDiaMontevideo(a);
  const diaB = obtenerClaveDiaMontevideo(b);
  return diaA === diaB;
}

export function obtenerClaveDiaMontevideo(date: Date): string {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  });
  return formatter.format(date);
}

export function calcularNivelUrgenciaTriage(
  horasHastaInicio: number,
  tieneAsistente: boolean
): "CRITICO" | "MODERADO" | "NORMAL" {
  if (tieneAsistente) {
    return "NORMAL";
  }
  if (horasHastaInicio <= 4) {
    return "CRITICO";
  }
  if (horasHastaInicio <= 12) {
    return "MODERADO";
  }
  return "NORMAL";
}

