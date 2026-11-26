/** Fachada temporal de compatibilidad; usar src/modules/asistencia/domain. */
export {
  SEPARACION_MINIMA_ASISTENCIAS_MINUTOS,
  asignacionAsistenciaSchema,
  cumpleSeparacionMinimaAsistencias,
  desvinculacionAsistenciaSchema,
  disponibilidadSemanalSchema,
  estadoInteresParaAccion,
  notificacionAsistenciaSchema,
  postulacionAsistenciaSchema,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  reporteDuracionSchema
} from "./domain/asistencia.domain";
