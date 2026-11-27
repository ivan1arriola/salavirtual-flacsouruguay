/** Fachada temporal de compatibilidad; usar src/modules/asistencia/domain. */
export {
  SEPARACION_MINIMA_ASISTENCIAS_MINUTOS,
  asignacionAsistenciaSchema,
  cumpleSeparacionMinimaAsistencias,
  desvinculacionAsistenciaSchema,
  disponibilidadSemanalSchema,
  esAsistenciaCompletada,
  estadoInteresParaAccion,
  notificacionAsistenciaSchema,
  postulacionAsistenciaSchema,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  reporteDuracionSchema,
} from "./domain/asistencia.domain";
export type { PeriodoAsistencia } from "./domain/asistencia.types";
