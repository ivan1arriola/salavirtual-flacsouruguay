import type { RolUsuario } from "@/src/modules/usuarios/roles";
import {
  TIPOS_NOTIFICACION,
  type TipoNotificacion
} from "@/src/modules/notificaciones/notificaciones.domain";

export function tiposNotificacionPerfil(rol: RolUsuario): TipoNotificacion[] {
  return TIPOS_NOTIFICACION.filter((tipo) => {
    switch (tipo) {
      case "HOST_NO_CONECTADO":
        return false;
      case "ASISTENCIA_POSTULACION":
      case "ASISTENCIA_POSTULACION_RETIRADA":
        return rol === "ADMINISTRACION";
      case "ASISTENCIA_REQUERIDA":
        return rol === "ASISTENTE_TECNICO";
      default:
        return true;
    }
  });
}
