import { TIPOS_NOTIFICACION, type TipoNotificacion } from "./notificaciones.types";

export function esTipoNotificacion(value: string): value is TipoNotificacion {
  return TIPOS_NOTIFICACION.includes(value as TipoNotificacion);
}

export function etiquetaTipoNotificacion(tipo: TipoNotificacion): string {
  switch (tipo) {
    case "REUNION_RECORDATORIO":
      return "Recordatorios de reuniones (24 h antes)";
    case "REUNION_CREADA":
      return "Reuniones creadas";
    case "ASISTENCIA_REQUERIDA":
      return "Reuniones abiertas a monitoreo";
    case "ASISTENCIA_ASIGNACION":
      return "Asignaciones de monitoreo";
    case "ASISTENCIA_POSTULACION":
      return "Postulaciones de asistentes de monitoreo";
    case "ASISTENCIA_POSTULACION_RETIRADA":
      return "Retiros de postulación";
    case "CREDENCIALES_SALA_CAMBIADAS":
      return "Cambios de credenciales de salas Meet";
    case "HOST_NO_CONECTADO":
      return "Host no conectado a reunión próxima";
  }
}
