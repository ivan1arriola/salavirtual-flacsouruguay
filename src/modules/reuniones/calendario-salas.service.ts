export function resolverSemanaCalendarioSalas(
  value: string | undefined,
  now: Date
): Readonly<{ desde: Date; hasta: Date }> {
  const date = value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : fechaMontevideo(now);
  const source = new Date(`${date}T00:00:00-03:00`);
  const mondayOffset = (source.getUTCDay() + 6) % 7;
  const desde = new Date(source.getTime() - mondayOffset * 24 * 60 * 60 * 1000);
  return { desde, hasta: new Date(desde.getTime() + 7 * 24 * 60 * 60 * 1000) };
}

function fechaMontevideo(value: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Montevideo", year: "numeric", month: "2-digit", day: "2-digit"
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}
