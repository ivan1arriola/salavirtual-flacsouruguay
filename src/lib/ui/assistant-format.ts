const monthFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  month: "long",
  year: "numeric",
});

export function formatMinutes(total: number): string {
  const minutes = Math.max(0, Math.round(total));
  return `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`;
}

export function formatMoney(amount: number, currency = "UYU"): string {
  return new Intl.NumberFormat("es-UY", {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatMonth(date: Date): string {
  const label = monthFormatter.format(date);
  return label.charAt(0).toUpperCase() + label.slice(1);
}
