export type EstadoReunionOperativa =
  | "PROGRAMADA"
  | "ESPERANDO_INICIO"
  | "EN_CURSO"
  | "FINALIZADA"
  | "NO_INICIADA";

export type DerivarEstadoReunionInput = {
  ahora: Date;
  inicio: Date;
  fin: Date;
  conferenciaInicio: Date | null;
  conferenciaFin: Date | null;
};

/**
 * Deriva el estado operativo visible para asistencia técnica.
 *
 * El horario previsto nunca alcanza para declarar una reunión EN_CURSO:
 * ese estado requiere que Google Meet haya confirmado el inicio real de
 * una conferencia.
 */
export function derivarEstadoReunion(
  input: DerivarEstadoReunionInput,
): EstadoReunionOperativa {
  if (input.conferenciaInicio && input.conferenciaFin) return "FINALIZADA";
  if (input.conferenciaInicio) return "EN_CURSO";
  if (input.ahora < input.inicio) return "PROGRAMADA";
  if (input.ahora <= input.fin) return "ESPERANDO_INICIO";
  return "NO_INICIADA";
}
