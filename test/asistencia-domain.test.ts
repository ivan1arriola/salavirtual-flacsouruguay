import { describe, expect, it } from "vitest";
import {
  asignacionAsistenciaSchema,
  estadoInteresParaAccion,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  postulacionAsistenciaSchema
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
  });
});
