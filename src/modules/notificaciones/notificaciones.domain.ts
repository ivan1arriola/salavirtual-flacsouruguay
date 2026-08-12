export const TIPOS_NOTIFICACION = Object.freeze([
  "REUNION_CREADA",
  "ASISTENCIA_REQUERIDA",
  "ASISTENCIA_ASIGNACION",
  "ASISTENCIA_POSTULACION",
  "ASISTENCIA_POSTULACION_RETIRADA"
] as const);

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

export type PreferenciaCanales = Readonly<{
  push: boolean;
  email: boolean;
}>;

export const PREFERENCIA_PREDETERMINADA: PreferenciaCanales = Object.freeze({
  push: true,
  email: true
});

export function esTipoNotificacion(value: string): value is TipoNotificacion {
  return TIPOS_NOTIFICACION.includes(value as TipoNotificacion);
}

export function etiquetaTipoNotificacion(tipo: TipoNotificacion): string {
  switch (tipo) {
    case "REUNION_CREADA":
      return "Reuniones creadas";
    case "ASISTENCIA_REQUERIDA":
      return "Reuniones abiertas a asistencia técnica";
    case "ASISTENCIA_ASIGNACION":
      return "Asignaciones de asistencia técnica";
    case "ASISTENCIA_POSTULACION":
      return "Postulaciones de asistentes técnicos";
    case "ASISTENCIA_POSTULACION_RETIRADA":
      return "Retiros de postulación";
  }
}
