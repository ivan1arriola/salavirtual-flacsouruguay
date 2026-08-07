import { describe, expect, it } from "vitest";
import {
  actualizarEncuentroSchema,
  elegirCuentaHost,
  elegirCuentaHostParaPeriodos,
  puedeGestionarEncuentros
} from "../src/modules/reuniones/encuentros.domain";

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

  it("rechaza una reprogramacion que cruza de dia", () => {
    expect(actualizarEncuentroSchema.safeParse({
      accion: "EDITAR_FECHA",
      inicio: "2026-08-03T23:00:00-03:00",
      fin: "2026-08-04T00:30:00-03:00"
    }).success).toBe(false);
  });

  it("respeta el limite concurrente configurado de una sala", () => {
    const periodo = {
      inicio: new Date("2026-08-03T13:00:00Z"),
      fin: new Date("2026-08-03T15:00:00Z")
    };
    expect(elegirCuentaHostParaPeriodos(null, [
      { id: "s1", prioridad: 1, limiteConcurrente: 2 }
    ], [{ cuentaProveedorId: "s1", ...periodo }], [periodo])).toBe("s1");
    expect(elegirCuentaHostParaPeriodos(null, [
      { id: "s1", prioridad: 1, limiteConcurrente: 1 }
    ], [{ cuentaProveedorId: "s1", ...periodo }], [periodo])).toBeNull();
  });
});
