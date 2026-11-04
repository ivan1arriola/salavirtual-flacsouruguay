export type Option = Readonly<{ id: string; label: string }>;
export type ProgramOption = Option & Readonly<{ teacher: string }>;
export type MeetingDate = Readonly<{
  /** Identifica la fila para React; nunca se envía al servidor. */
  id: number;
  fecha: string;
  horaInicio: string;
  horaFin: string;
  horaAsistenciaInicio: string;
  horaAsistenciaFin: string;
  descripcion: string;
}>;
export type MeetingDateMode = "SINGLE" | "RECURRENT" | "MANUAL";
export type RecurrenceState = Readonly<{
  desde: string;
  hasta: string;
  diasSemana: readonly number[];
  horaInicio: string;
  horaFin: string;
  horaAsistenciaInicio: string;
  horaAsistenciaFin: string;
}>;
