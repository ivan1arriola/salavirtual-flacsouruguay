import { describe, expect, it } from "vitest";
import { puedeGestionarEncuentros } from "../src/modules/reuniones/encuentros.domain";

describe("permisos de reuniones compartidas por programa", () => {
  it("mantiene Administración con acceso global", () => {
    expect(puedeGestionarEncuentros("ADMINISTRACION", "admin", "otro")).toBe(true);
  });

  it("mantiene restringido el helper legado de titularidad", () => {
    expect(puedeGestionarEncuentros("DOCENTE", "docente", "docente")).toBe(true);
    expect(puedeGestionarEncuentros("DOCENTE", "docente-a", "docente-b")).toBe(false);
  });
});
