import { describe, expect, it } from "vitest";
import { puedeVerEnlaceAnfitrion } from "../src/modules/reuniones/enlace-anfitrion.domain";

describe("quién puede ver el enlace de anfitrión de Zoom", () => {
  it("administración sí", () => {
    expect(puedeVerEnlaceAnfitrion({ id: "a", rol: "ADMINISTRACION" }, "docente-1")).toBe(true);
  });

  it("el docente titular sí", () => {
    expect(puedeVerEnlaceAnfitrion({ id: "docente-1", rol: "DOCENTE" }, "docente-1")).toBe(true);
  });

  it("otro docente no", () => {
    expect(puedeVerEnlaceAnfitrion({ id: "docente-2", rol: "DOCENTE" }, "docente-1")).toBe(false);
  });

  it("un asistente técnico no, aunque comparta id con el titular por error de datos", () => {
    expect(
      puedeVerEnlaceAnfitrion({ id: "docente-1", rol: "ASISTENTE_TECNICO" }, "docente-1"),
    ).toBe(false);
  });

  it("cualquier otro rol no", () => {
    expect(puedeVerEnlaceAnfitrion({ id: "e", rol: "ESTUDIANTE" }, "docente-1")).toBe(false);
  });
});
