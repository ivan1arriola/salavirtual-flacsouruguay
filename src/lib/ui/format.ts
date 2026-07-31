const dateTimeFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit"
});

const shortDateFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "long",
  day: "numeric",
  month: "long"
});

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

export function formatShortDate(date: Date): string {
  return shortDateFormatter.format(date);
}
