import { describe, expect, it } from "vitest";
import {
  completarRegistroInstitucionalSchema,
  requiereCompletarRegistro,
} from "../src/modules/usuarios/registro-institucional.domain";

describe("registro institucional", () => {
  it("obliga a un docente sin programas a completar el registro", () => {
    expect(requiereCompletarRegistro({ rol: "DOCENTE", programasActivos: 0 })).toBe(true);
    expect(requiereCompletarRegistro({ rol: "DOCENTE", programasActivos: 1 })).toBe(false);
    expect(requiereCompletarRegistro({ rol: "ASISTENTE_TECNICO", programasActivos: 0 })).toBe(
      false,
    );
  });

  it("exige elegir un programa o crear uno, pero no ambas opciones", () => {
    expect(
      completarRegistroInstitucionalSchema.safeParse({ programaId: "programa", programaNuevo: "" })
        .success,
    ).toBe(true);
    expect(
      completarRegistroInstitucionalSchema.safeParse({
        programaId: "",
        programaNuevo: "Programa nuevo",
      }).success,
    ).toBe(true);
    expect(
      completarRegistroInstitucionalSchema.safeParse({ programaId: "", programaNuevo: "" }).success,
    ).toBe(false);
    expect(
      completarRegistroInstitucionalSchema.safeParse({
        programaId: "programa",
        programaNuevo: "Otro",
      }).success,
    ).toBe(false);
  });
});
