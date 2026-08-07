import { describe, expect, it } from "vitest";
import {
  asignacionAsistenciaSchema,
  disponibilidadSemanalSchema,
  estadoInteresParaAccion,
  estadoParaRespuestaAsignacion,
  notificacionAsistenciaSchema,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  postulacionAsistenciaSchema,
  reporteDuracionSchema,
  respuestaAsignacionSchema
} from "../src/modules/asistencia/asistencia.domain";

describe("flujo funcional de asistencia", () => {
  it("reserva postulaciones a Asistente y asignaciones a Administracion", () => {
    expect(puedeGestionarPostulacion("ASISTENTE")).toBe(true);
    expect(puedeGestionarPostulacion("DOCENTE")).toBe(false);
    expect(puedeAsignarAsistencia("ADMINISTRACION")).toBe(true);
    expect(puedeAsignarAsistencia("ASISTENTE")).toBe(false);
  });

  it("deriva el estado sin mutar la entrada", () => {
    expect(estadoInteresParaAccion("POSTULAR")).toBe("ME_INTERESA");
    expect(estadoInteresParaAccion("RETIRAR")).toBe("RETIRADO");
  });

  it("valida los contratos de postulación y asignación", () => {
    expect(
      postulacionAsistenciaSchema.parse({
        instanciaSalaId: "meeting",
        accion: "POSTULAR"
      })
    ).toEqual({ instanciaSalaId: "meeting", accion: "POSTULAR" });
    expect(
      asignacionAsistenciaSchema.parse({
        instanciaSalaId: "meeting",
        asistenteId: "assistant"
      })
    ).toEqual({ instanciaSalaId: "meeting", asistenteId: "assistant" });
    expect(notificacionAsistenciaSchema.parse({ instanciaSalaId: "meeting" }))
      .toEqual({ instanciaSalaId: "meeting" });
    expect(notificacionAsistenciaSchema.safeParse({ instanciaSalaId: "" }).success).toBe(false);
  });

  it("acepta una duración real razonable con comentario opcional", () => {
    expect(reporteDuracionSchema.parse({
      asignacionId: "assignment",
      minutos: 95,
      comentario: "Se extendió por consultas."
    })).toEqual({
      asignacionId: "assignment",
      minutos: 95,
      comentario: "Se extendió por consultas."
    });
    expect(reporteDuracionSchema.safeParse({ asignacionId: "assignment", minutos: 0 }).success).toBe(false);
  });

  it("modela confirmar o rechazar una asignación pendiente", () => {
    expect(respuestaAsignacionSchema.parse({ asignacionId: "assignment", accion: "ACEPTAR" }))
      .toEqual({ asignacionId: "assignment", accion: "ACEPTAR" });
    expect(estadoParaRespuestaAsignacion("ACEPTAR")).toBe("ACEPTADO");
    expect(estadoParaRespuestaAsignacion("RECHAZAR")).toBe("RECHAZADO");
  });

  it("valida franjas semanales de disponibilidad", () => {
    expect(disponibilidadSemanalSchema.safeParse({
      disponibleGeneral: true,
      franjas: [{ diaSemana: 1, horaDesde: "09:00", horaHasta: "18:00", tipo: "PREFERENTE" }]
    }).success).toBe(true);
    expect(disponibilidadSemanalSchema.safeParse({
      disponibleGeneral: true,
      franjas: [{ diaSemana: 1, horaDesde: "18:00", horaHasta: "09:00", tipo: "DISPONIBLE" }]
    }).success).toBe(false);
  });
});
