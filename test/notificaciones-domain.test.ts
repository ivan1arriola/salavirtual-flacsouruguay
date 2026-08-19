import { describe, expect, it } from "vitest";
import {
  PREFERENCIA_PREDETERMINADA,
  TIPOS_NOTIFICACION,
  esTipoNotificacion,
  etiquetaTipoNotificacion
} from "../src/modules/notificaciones/notificaciones.domain";

describe("notificaciones", () => {
  it("reconoce todos los tipos soportados y rechaza valores desconocidos", () => {
    for (const tipo of TIPOS_NOTIFICACION) {
      expect(esTipoNotificacion(tipo)).toBe(true);
    }
    expect(esTipoNotificacion("OTRA_NOTIFICACION")).toBe(false);
    expect(esTipoNotificacion("")).toBe(false);
  });

  it("mantiene activados email y push como preferencia predeterminada inmutable", () => {
    expect(PREFERENCIA_PREDETERMINADA).toEqual({ push: true, email: true });
    expect(Object.isFrozen(PREFERENCIA_PREDETERMINADA)).toBe(true);
    expect(Object.isFrozen(TIPOS_NOTIFICACION)).toBe(true);
  });

  it.each([
    ["REUNION_CREADA", "Reuniones creadas"],
    ["ASISTENCIA_REQUERIDA", "Reuniones abiertas a asistencia técnica"],
    ["ASISTENCIA_ASIGNACION", "Asignaciones de asistencia técnica"],
    ["ASISTENCIA_POSTULACION", "Postulaciones de asistentes técnicos"],
    ["ASISTENCIA_POSTULACION_RETIRADA", "Retiros de postulación"],
    ["CREDENCIALES_SALA_CAMBIADAS", "Cambios de credenciales de salas Meet"]
  ] as const)("etiqueta %s correctamente", (tipo, expected) => {
    expect(etiquetaTipoNotificacion(tipo)).toBe(expected);
  });
});
