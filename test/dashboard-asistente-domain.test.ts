import { describe, expect, it } from "vitest";
import {
  claveMesAnteriorUtc3,
  formatTiempoRestante
} from "../src/modules/asistencia/dashboard-asistente.domain";

describe("dashboard funcional del asistente", () => {
  it("resuelve el mes anterior en UTC-3 incluso al cambiar de año", () => {
    expect(claveMesAnteriorUtc3(new Date("2026-07-31T15:00:00Z"))).toBe("2026-06");
    expect(claveMesAnteriorUtc3(new Date("2026-01-10T15:00:00Z"))).toBe("2025-12");
  });

  it("formatea la espera sin depender del reloj del sistema", () => {
    const now = Date.parse("2026-07-31T12:00:00Z");
    expect(formatTiempoRestante(now + 18 * 60 * 60_000 + 3 * 60_000, now)).toBe("En 18 h 3 min");
    expect(formatTiempoRestante(now - 1, now)).toBe("Ahora");
  });
});
