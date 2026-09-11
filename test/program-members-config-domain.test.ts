import { describe, expect, it } from "vitest";
import { filterPrograms } from "../src/components/program-members-config.domain";

const programs = [
  { id: "1", nombre: "Maestría en Educación", codigo: "ME", activo: true, unidadAcademica: { nombre: "Posgrados" } },
  { id: "2", nombre: "Formación Permanente", codigo: null, activo: false, unidadAcademica: null },
  { id: "3", nombre: "Diploma Social", codigo: "DS", activo: true, unidadAcademica: { nombre: "Ciencias Sociales" } }
];

describe("filtro de programas", () => {
  it("busca por nombre, código o unidad académica", () => {
    expect(filterPrograms(programs, { query: "educación", state: "todos" }).map(({ id }) => id)).toEqual(["1"]);
    expect(filterPrograms(programs, { query: "DS", state: "todos" }).map(({ id }) => id)).toEqual(["3"]);
    expect(filterPrograms(programs, { query: "posgrados", state: "todos" }).map(({ id }) => id)).toEqual(["1"]);
  });

  it("separa programas activos e inactivos", () => {
    expect(filterPrograms(programs, { query: "", state: "activos" }).map(({ id }) => id)).toEqual(["1", "3"]);
    expect(filterPrograms(programs, { query: "", state: "inactivos" }).map(({ id }) => id)).toEqual(["2"]);
  });
});
