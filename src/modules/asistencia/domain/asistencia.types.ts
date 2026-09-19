export type ModalidadAsistencia = "VIRTUAL" | "HIBRIDA";

export type AccionHistorialAsistencia = "ASIGNADO" | "REASIGNADO" | "DESVINCULADO";

export type PeriodoAsistencia = Readonly<{
  inicio: Date;
  fin: Date;
}>;

export type RegistroAsistenciaPersonal = Readonly<{
  id: string;
  instanciaId: string;
  titulo: string;
  programa: string;
  docente: string;
  inicioAt: Date;
  finAt: Date;
  inicioRealAt: Date | null;
  finRealAt: Date | null;
  modalidad: ModalidadAsistencia;
  estado: string;
  completada: boolean;
  cierreConfirmado: boolean;
  minutos: number;
  minutosProgramados: number;
  minutosReportados: number | null;
  comentarioReporte: string | null;
  tarifaHora: number | null;
  monto: number | null;
  moneda: string;
}>;

export type RegistroHistorialAsistenciaPersonal = Readonly<{
  id: string;
  accion: AccionHistorialAsistencia;
  titulo: string;
  instanciaInicioAt: Date;
  ocurrioAt: Date;
  actor: string;
}>;

export type AsignacionExistente = Readonly<{
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
}>;

export type ConflictoAsistenciaResultado =
  | {
      estado: "DISPONIBLE";
      etiqueta: "Disponible";
      tone: "green";
    }
  | {
      estado: "CONFLICTO";
      etiqueta: "Conflicto de horario";
      detalle: string;
      tone: "red";
      reunionConflicto: AsignacionExistente;
    }
  | {
      estado: "MUY_PROXIMO";
      etiqueta: "Muy próximo";
      detalle: string;
      minutosSeparacion: number;
      tone: "amber";
      reunionConflicto: AsignacionExistente;
    };

export type AssignmentCandidate = Readonly<{
  asistenteTecnicoId: string;
  nombre: string;
  cargaMensualMinutos: number;
  disponible: boolean;
}>;

export type DisponibilidadInput = Readonly<{
  diaSemana: number | null;
  fecha: Date | null;
  horaDesde: string;
  horaHasta: string;
  timezone: string;
  tipo: "DISPONIBLE" | "NO_DISPONIBLE" | "PREFERENTE";
}>;

export type AssignmentSuggestionInput = Readonly<{
  meetings: readonly Readonly<{
    covered: boolean;
    meeting: {
      id: string;
      inicioProgramadoAt: Date;
      finProgramadoAt: Date;
      timezone: string;
      postulaciones: readonly Readonly<{ asistenteTecnico: { id: string } }>[];
    };
  }>[];
  assistants: readonly Readonly<{
    id: string;
    name: string;
    cesadoHastaProximoInicioSesion?: boolean;
    disponibilidades?: readonly DisponibilidadInput[];
  }>[];
  assignments: readonly Readonly<{
    assistantId: string;
    meetingId: string;
    startsAt: Date;
    endsAt: Date;
    timezone: string;
  }>[];
}>;

export type AssignmentSuggestion = Readonly<{
  id: string;
  name: string;
  reason: string;
}>;
