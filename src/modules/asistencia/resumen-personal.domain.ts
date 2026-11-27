/** Fachada temporal de compatibilidad para reglas personales y de liquidación. */
export {
  agruparPorMes,
  esAsistenciaCompletada,
  resolverAccionHistorialAsistente,
} from "./domain/asistencia.domain";
export {
  calcularMinutos,
  calcularMonto,
  claveMesUtc3,
  rangoMesUtc3,
  resumirAsistencias,
} from "@/src/modules/liquidaciones/domain";
export type {
  AccionHistorialAsistencia,
  ModalidadAsistencia,
  RegistroAsistenciaPersonal,
  RegistroHistorialAsistenciaPersonal,
} from "./domain/asistencia.types";
export type { ResumenAsistencia } from "@/src/modules/liquidaciones/domain";
