/** Fachada temporal de compatibilidad; usar src/modules/asistencia/domain. */
export { buildAssignmentSuggestions, evaluarDisponibilidad } from "./domain/asignacion-sugerencias.domain";
export type {
  AssignmentSuggestion,
  AssignmentSuggestionInput,
  DisponibilidadInput
} from "./domain/asistencia.types";
