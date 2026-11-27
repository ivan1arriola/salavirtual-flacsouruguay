import { describe, expect, it } from "vitest";
import {
  puedeGestionarProgramasDocente,
  puedeGestionarProgramasPropios,
  programasDocenteSchema,
} from "../src/modules/usuarios/programas-docente.domain";

describe("programas propios del docente", () => {
  it("permite gestionarlos a docentes y Administracion activos", () => {
    expect(puedeGestionarProgramasPropios({ id: "d", rol: "DOCENTE", activo: true })).toBe(true);
    expect(puedeGestionarProgramasPropios({ id: "a", rol: "ADMINISTRACION", activo: true })).toBe(
      true,
    );
    expect(puedeGestionarProgramasPropios({ id: "d", rol: "DOCENTE", activo: false })).toBe(false);
    expect(
      puedeGestionarProgramasPropios({ id: "a", rol: "ASISTENTE_TECNICO", activo: true }),
    ).toBe(false);
  });

  it("permite a Administracion gestionar otro docente", () => {
    expect(
      puedeGestionarProgramasDocente(
        { id: "admin", rol: "ADMINISTRACION", activo: true },
        "docente",
      ),
    ).toBe(true);
    expect(
      puedeGestionarProgramasDocente({ id: "docente", rol: "DOCENTE", activo: true }, "docente"),
    ).toBe(true);
    expect(
      puedeGestionarProgramasDocente({ id: "otro", rol: "DOCENTE", activo: true }, "docente"),
    ).toBe(false);
  });

  it("acepta una seleccion vacia y elimina identificadores repetidos", () => {
    expect(programasDocenteSchema.parse({ programaIds: [] })).toEqual({ programaIds: [] });
    expect(programasDocenteSchema.parse({ programaIds: ["p1", "p1", "p2"] })).toEqual({
      programaIds: ["p1", "p2"],
    });
  });
});
