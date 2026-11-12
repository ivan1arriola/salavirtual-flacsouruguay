import { describe, expect, it } from "vitest";
import { obtenerClaveDiaMontevideo } from "../src/modules/dashboard/dashboard.domain";

describe("adaptadores de dashboard", () => {
  it("valida la construcción de claves de fecha para consultas Prisma", () => {
    const fecha = new Date("2026-09-11T15:00:00Z");
    const clave = obtenerClaveDiaMontevideo(fecha);
    expect(clave).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
