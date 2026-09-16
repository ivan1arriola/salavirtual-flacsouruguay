import { describe, expect, it } from "vitest";
import { puedeConsultarReunionOperativa } from "../src/modules/asistencia/reunion-operativa-access.domain";

describe("puedeConsultarReunionOperativa", () => {
  it("permite al asistente con asignación activa", () => {
    expect(puedeConsultarReunionOperativa({
      rol: "ASISTENTE_TECNICO",
      asignado: true
    })).toBe(true);
  });

  it("impide al asistente no asignado", () => {
    expect(puedeConsultarReunionOperativa({
      rol: "ASISTENTE_TECNICO",
      asignado: false
    })).toBe(false);
  });

  it("permite a Administración consultar cualquier reunión", () => {
    expect(puedeConsultarReunionOperativa({
      rol: "ADMINISTRACION",
      asignado: false
    })).toBe(true);
  });
});
