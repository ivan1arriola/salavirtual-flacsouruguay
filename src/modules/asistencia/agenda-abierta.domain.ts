/** Fachada temporal de compatibilidad; usar src/modules/asistencia/domain. */
export {
  agruparPorFecha,
  evaluarConflictoAsistencia,
  formatearDiasRestantes,
  ordenarPostulantesParaAdministracion
} from "./domain/agenda-abierta.domain";
export type { AsignacionExistente, ConflictoAsistenciaResultado } from "./domain/asistencia.types";
export type { PostulanteEvaluado } from "./domain/agenda-abierta.domain";
