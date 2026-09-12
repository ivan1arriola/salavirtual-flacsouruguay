import { describe, expect, it } from "vitest";
import {
  determinarEstadoTemporal,
  esMismoDiaMontevideo,
  formatearTiempoHastaReunion
} from "../src/modules/dashboard/dashboard.domain";

describe("integración de vistas de dashboard", () => {
  const baseDate = new Date("2026-09-11T18:00:00-03:00");

  it("garantiza que reuniones con inicio a futuro el mismo día se identifiquen para timeline", () => {
    const inicio = new Date("2026-09-11T20:00:00-03:00");
    const fin = new Date("2026-09-11T22:00:00-03:00");

    expect(esMismoDiaMontevideo(inicio, baseDate)).toBe(true);
    expect(determinarEstadoTemporal(inicio, fin, baseDate)).toBe("PROXIMA_HOY");
    expect(formatearTiempoHastaReunion(inicio, baseDate)).toBe("Empieza en 2 h");
  });

  it("garantiza que clases en curso se identifiquen como EN_VIVO para el Hero docente", () => {
    const inicio = new Date("2026-09-11T17:55:00-03:00");
    const fin = new Date("2026-09-11T19:30:00-03:00");

    expect(determinarEstadoTemporal(inicio, fin, baseDate)).toBe("EN_VIVO");
    expect(formatearTiempoHastaReunion(inicio, baseDate)).toBe("En curso");
  });
});

