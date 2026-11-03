import { describe, expect, it } from "vitest";
import { reunionCompartidaHabilitada } from "../src/modules/reuniones/reunion-compartida.domain";

describe("bandera de creación de reuniones compartidas", () => {
  it("está apagada por defecto", () => {
    expect(reunionCompartidaHabilitada({})).toBe(false);
    expect(reunionCompartidaHabilitada({ ZOOM_REUNION_COMPARTIDA: undefined })).toBe(false);
  });

  it("solo se enciende con 1 o true", () => {
    expect(reunionCompartidaHabilitada({ ZOOM_REUNION_COMPARTIDA: "1" })).toBe(true);
    expect(reunionCompartidaHabilitada({ ZOOM_REUNION_COMPARTIDA: "true" })).toBe(true);
  });

  it("cualquier otro valor la deja apagada", () => {
    for (const valor of ["0", "false", "", "si", "TRUE ", "2", " 1"]) {
      expect(reunionCompartidaHabilitada({ ZOOM_REUNION_COMPARTIDA: valor }), valor).toBe(false);
    }
  });
});
