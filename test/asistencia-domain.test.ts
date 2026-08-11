import { describe, expect, it } from "vitest";
import {
  asignacionAsistenciaSchema,
  disponibilidadSemanalSchema,
  estadoInteresParaAccion,
  notificacionAsistenciaSchema,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  postulacionAsistenciaSchema,
  reporteDuracionSchema
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

  it("valida el cierre con horario real e incidencia opcional", () => {
    const result = reporteDuracionSchema.parse({
      asignacionId: "assignment",
      inicioReal: "2026-08-07T21:00:00.000Z",
      finReal: "2026-08-07T22:35:00.000Z",
      comentario: "Se extendió por consultas.",
      incidencia: { tipo: "Audio", severidad: "MEDIA", descripcion: "Hubo cortes breves." }
    });
    expect(result.inicioReal).toBeInstanceOf(Date);
    expect(result.incidencia?.severidad).toBe("MEDIA");
    expect(reporteDuracionSchema.safeParse({
      asignacionId: "assignment",
      inicioReal: "2026-08-07T22:00:00.000Z",
      finReal: "2026-08-07T21:00:00.000Z"
    }).success).toBe(false);
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
