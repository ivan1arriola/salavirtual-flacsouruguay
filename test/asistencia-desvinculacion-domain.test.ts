import { describe, expect, it } from "vitest";
import * as asistencia from "../src/modules/asistencia/asistencia.domain";
import * as resumen from "../src/modules/asistencia/resumen-personal.domain";

describe("desvinculación de monitoreo", () => {
  it("valida una desvinculación solo por id de asignación", () => {
    const schema = (asistencia as any).desvinculacionAsistenciaSchema;
    expect(schema).toBeDefined();
    expect(schema.parse({ asignacionId: "asig-1" })).toEqual({ asignacionId: "asig-1" });
  });

  it("interpreta los eventos de auditoría para el asistente", () => {
    const resolver = (resumen as any).resolverAccionHistorialAsistente;
    expect(typeof resolver).toBe("function");
    expect(resolver("ASISTENTE_ASIGNADO", null, "at-1", "at-1")).toBe("ASIGNADO");
    expect(resolver("ASISTENTE_REASIGNADO", "at-1", "at-2", "at-1")).toBe("DESVINCULADO");
    expect(resolver("ASISTENTE_REASIGNADO", "at-2", "at-1", "at-1")).toBe("REASIGNADO");
    expect(resolver("ASISTENTE_DESVINCULADO", "at-1", "at-1", "at-1")).toBe("DESVINCULADO");
  });
});
