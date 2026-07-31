import { describe, expect, it } from "vitest";
import {
  puedeGestionarProgramasPropios,
  programasDocenteSchema
} from "../src/modules/usuarios/programas-docente.domain";

describe("programas propios del docente", () => {
  it("solo permite gestionarlos al docente activo", () => {
    expect(puedeGestionarProgramasPropios({ id: "d", rol: "DOCENTE", activo: true })).toBe(true);
    expect(puedeGestionarProgramasPropios({ id: "a", rol: "ADMINISTRACION", activo: true })).toBe(false);
    expect(puedeGestionarProgramasPropios({ id: "d", rol: "DOCENTE", activo: false })).toBe(false);
  });

  it("acepta una seleccion vacia y elimina identificadores repetidos", () => {
    expect(programasDocenteSchema.parse({ programaIds: [] })).toEqual({ programaIds: [] });
    expect(programasDocenteSchema.parse({ programaIds: ["p1", "p1", "p2"] })).toEqual({
      programaIds: ["p1", "p2"]
    });
  });
});
