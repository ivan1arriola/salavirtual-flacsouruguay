/** Fachada temporal de compatibilidad; usar src/modules/asistencia/domain. */
export {
  agruparPorFecha,
  evaluarConflictoAsistencia,
  formatearDiasRestantes,
  ordenarPostulantesParaAdministracion
} from "./domain/agenda-abierta.domain";
export type { AsignacionExistente } from "./domain/asistencia.types";
