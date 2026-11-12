const utc3PartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit"
});

function yearAndMonthUtc3(fecha: Date): Readonly<{ year: number; month: number }> {
  const parts = utc3PartsFormatter.formatToParts(fecha);
  const value = (type: "year" | "month") => Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month") };
}

export function claveMesAnteriorUtc3(fecha: Date): string {
  const { year, month } = yearAndMonthUtc3(fecha);
  return month === 1 ? `${year - 1}-12` : `${year}-${String(month - 1).padStart(2, "0")}`;
}

export function formatTiempoRestante(inicioMs: number, ahoraMs: number): string {
  const totalMinutes = Math.max(0, Math.ceil((inicioMs - ahoraMs) / 60_000));
  if (totalMinutes === 0) {
    return "Ahora";
  }
  const days = Math.floor(totalMinutes / (24 * 60));
  const hours = Math.floor((totalMinutes % (24 * 60)) / 60);
  const minutes = totalMinutes % 60;
  if (days > 0) {
    return `En ${days} d ${hours} h`;
  }
  if (hours > 0) {
    return `En ${hours} h ${minutes} min`;
  }
  return `En ${minutes} min`;
}

export function contarPostulacionesAbiertas(
  instanciasAbiertasIds: ReadonlySet<string>,
  postulaciones: readonly Readonly<{
    instanciaSalaId: string;
    estado: "ME_INTERESA" | "NO_ME_INTERESA" | "RETIRADO";
  }>[]
): number {
  return postulaciones.filter(
    ({ instanciaSalaId, estado }) => estado === "ME_INTERESA" && instanciasAbiertasIds.has(instanciaSalaId)
  ).length;
}
