const dateTimeFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "2-digit",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

const shortDateFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "long",
  day: "numeric",
  month: "long"
});

const dateFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "short",
  day: "2-digit",
  month: "short"
});

const longDateFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric"
});

const timeFormatter = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23"
});

export function formatDateTime(date: Date): string {
  return dateTimeFormatter.format(date);
}

export function formatShortDate(date: Date): string {
  return shortDateFormatter.format(date);
}

export function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

export function formatLongDate(date: Date): string {
  return longDateFormatter.format(date);
}

export function formatTime(date: Date): string {
  return timeFormatter.format(date);
}
