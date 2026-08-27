import { describe, expect, it } from "vitest";
import {
  programaAdminSchema,
  puedeAdministrarProgramas
} from "../src/modules/programas/programas-admin.domain";

describe("CRUD administrativo de programas", () => {
  it("solo permite administrar programas a Administración activa", () => {
    expect(puedeAdministrarProgramas({ id: "admin", rol: "ADMINISTRACION", activo: true })).toBe(true);
    expect(puedeAdministrarProgramas({ id: "docente", rol: "DOCENTE", activo: true })).toBe(false);
    expect(puedeAdministrarProgramas({ id: "admin", rol: "ADMINISTRACION", activo: false })).toBe(false);
  });

  it("normaliza campos opcionales vacíos", () => {
    expect(programaAdminSchema.parse({
      nombre: "  Maestría en Educación  ",
      codigo: "",
      unidadAcademicaId: "",
      activo: true
    })).toEqual({
      nombre: "Maestría en Educación",
      codigo: null,
      unidadAcademicaId: null,
      activo: true
    });
  });

  it("rechaza nombres demasiado cortos", () => {
    expect(() => programaAdminSchema.parse({
      nombre: "A",
      codigo: null,
      unidadAcademicaId: null,
      activo: true
    })).toThrow();
  });
});
