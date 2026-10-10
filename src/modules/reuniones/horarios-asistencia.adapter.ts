import { desfaseDiaAsistencia } from "./horarios-asistencia.domain";

/** Conversión del horario técnico local de Montevideo a UTC, admitiendo días contiguos. */
export function asistenciaLocalAIso(
  fecha: string,
  horaEvento: string,
  horaAsistencia: string,
  extremo: "LLEGADA" | "SALIDA"
): string {
  const ajuste = desfaseDiaAsistencia(horaEvento, horaAsistencia, extremo);
  const instante = new Date(`${fecha}T${horaAsistencia}:00-03:00`);
  return new Date(instante.getTime() + ajuste * 24 * 60 * 60 * 1000).toISOString();
}
