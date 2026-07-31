import { describe, expect, it } from "vitest";
import { elegirCuentaHost, puedeGestionarEncuentros } from "../src/modules/reuniones/encuentros.domain";

describe("gestión funcional de encuentros", () => {
  it("permite Administracion y al docente titular", () => {
    expect(puedeGestionarEncuentros("ADMINISTRACION", "a", "d")).toBe(true);
    expect(puedeGestionarEncuentros("DOCENTE", "d", "d")).toBe(true);
    expect(puedeGestionarEncuentros("DOCENTE", "otro", "d")).toBe(false);
  });

  it("conserva la sala de la serie cuando está disponible", () => {
    expect(elegirCuentaHost("s2", [{ id: "s1", prioridad: 1 }, { id: "s2", prioridad: 2 }], [])).toBe("s2");
  });

  it("elige la sala disponible de mayor prioridad", () => {
    expect(elegirCuentaHost("s2", [{ id: "s2", prioridad: 2 }, { id: "s1", prioridad: 1 }], ["s2"])).toBe("s1");
  });
});
