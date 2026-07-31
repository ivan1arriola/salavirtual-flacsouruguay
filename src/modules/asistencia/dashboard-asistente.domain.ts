import { claveMesUtc3 } from "./resumen-personal.domain";

export function claveMesAnteriorUtc3(fecha: Date): string {
  const [yearText, monthText] = claveMesUtc3(fecha).split("-");
  const year = Number(yearText);
  const month = Number(monthText);
  return month === 1
    ? `${year - 1}-12`
    : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function formatTiempoRestante(inicioMs: number, ahoraMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil((inicioMs - ahoraMs) / 60_000));
  if (totalMinutes === 0) return "Ahora";
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) return `En ${days} d ${hours} h`;
  if (hours > 0) return `En ${hours} h ${minutes} min`;
  return `En ${minutes} min`;
}
