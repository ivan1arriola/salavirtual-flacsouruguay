import type { MeetingDate, MeetingDateMode, RecurrenceState } from "./tipos";

/** Copia ordenada y estable: las filas sin fecha quedan al final. */
export function ordenarEncuentros(fechas: readonly MeetingDate[]): MeetingDate[] {
  return [...fechas].sort(
    (a, b) =>
      (a.fecha || "9999").localeCompare(b.fecha || "9999") ||
      (a.horaInicio || "99:99").localeCompare(b.horaInicio || "99:99"),
  );
}

export function duplicarEncuentro(fecha: MeetingDate, id: number): MeetingDate {
  return { ...fecha, id };
}

/** La cobertura no cuenta como solapamiento; se comparan los encuentros completos. */
export function detectarSolapamientos(
  fechas: readonly MeetingDate[],
): readonly (readonly [number, number])[] {
  const validas = ordenarEncuentros(
    fechas.filter((f) => f.fecha && f.horaInicio && f.horaFin > f.horaInicio),
  );
  const pares: [number, number][] = [];
  for (const [i, a] of validas.entries()) {
    for (const b of validas.slice(i + 1)) {
      if (a.fecha !== b.fecha || b.horaInicio >= a.horaFin) {
        break;
      }
      pares.push([a.id, b.id]);
    }
  }
  return pares;
}

const formatoFecha = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  day: "numeric",
  month: "long",
  year: "numeric",
});
const formatoHora = new Intl.DateTimeFormat("es-UY", {
  timeZone: "America/Montevideo",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

/** Fecha ISO de un input date con año de 4 dígitos y día real; los valores intermedios al teclear no lo son. */
export function fechaIsoValida(valor: string): boolean {
  const partes = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  if (!partes) {
    return false;
  }
  const [anio, mes, dia] = [Number(partes[1]), Number(partes[2]), Number(partes[3])];
  if (anio < 1000) {
    return false;
  }
  const fecha = new Date(Date.UTC(anio, mes - 1, dia));
  return (
    fecha.getUTCFullYear() === anio && fecha.getUTCMonth() === mes - 1 && fecha.getUTCDate() === dia
  );
}

function describirFecha(fecha: MeetingDate): string {
  if (!fechaIsoValida(fecha.fecha)) {
    return "Fecha inválida";
  }
  // Offset explícito también al construir el instante: no interviene la zona del navegador.
  const dia = formatoFecha.format(new Date(`${fecha.fecha}T12:00:00-03:00`));
  const horaValida = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!horaValida.test(fecha.horaInicio) || !horaValida.test(fecha.horaFin)) {
    return `${dia}, horario pendiente`;
  }
  const inicio = formatoHora.format(new Date(`${fecha.fecha}T${fecha.horaInicio}:00-03:00`));
  const fin = formatoHora.format(new Date(`${fecha.fecha}T${fecha.horaFin}:00-03:00`));
  return `${dia}, ${inicio}–${fin}`;
}

export function resumirFechas(
  fechas: readonly MeetingDate[],
): Readonly<{ primera: string; ultima: string }> {
  const ordenadas = ordenarEncuentros(fechas.filter((f) => f.fecha));
  const primera = ordenadas[0];
  const ultima = ordenadas.at(-1);
  return primera && ultima
    ? {
        primera: describirFecha(primera),
        ultima: describirFecha(ultima),
      }
    : { primera: "Pendiente", ultima: "Pendiente" };
}

export function requiereConfirmacionCambio(
  actual: MeetingDateMode,
  destino: MeetingDateMode,
  fechas: readonly MeetingDate[],
  regla: RecurrenceState,
): boolean {
  if (actual === destino) {
    return false;
  }
  return (
    fechas.some(({ id: _id, ...campos }) => Object.values(campos).some(Boolean)) ||
    (actual === "RECURRENT" &&
      Object.values(regla).some((valor) =>
        Array.isArray(valor) ? valor.length > 0 : Boolean(valor),
      ))
  );
}

export function fechasAlCambiarModo(
  destino: MeetingDateMode,
  fechas: readonly MeetingDate[],
  nuevaFecha: () => MeetingDate,
): readonly MeetingDate[] {
  if (destino === "RECURRENT") {
    return [];
  }
  if (destino === "SINGLE") {
    return [ordenarEncuentros(fechas)[0] ?? nuevaFecha()];
  }
  return fechas.length ? fechas : [nuevaFecha()];
}

export function invalidarRecurrencia(): Readonly<{
  dates: readonly MeetingDate[];
  recurrenceGenerated: false;
  recurrenceMessage: string;
}> {
  return { dates: [], recurrenceGenerated: false, recurrenceMessage: "" };
}
