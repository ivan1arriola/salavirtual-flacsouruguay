import { describe, expect, it } from "vitest";
import {
  determinarEstadoTemporal,
  formatearTiempoHastaReunion
} from "../src/modules/dashboard/dashboard.domain";

describe("componentes compartidos de dashboard", () => {
  it("determina si la tarjeta hero debe mostrar el badge En Vivo o cuenta regresiva", () => {
    const ahora = new Date("2026-09-11T18:00:00-03:00");
    const inicio = new Date("2026-09-11T18:05:00-03:00");
    const fin = new Date("2026-09-11T19:30:00-03:00");

    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("EN_VIVO");
    expect(formatearTiempoHastaReunion(inicio, ahora)).toBe("Empieza en 5 min");
  });

  it("formatea correctamente cuando la clase ya comenzó", () => {
    const ahora = new Date("2026-09-11T18:20:00-03:00");
    const inicio = new Date("2026-09-11T18:00:00-03:00");
    const fin = new Date("2026-09-11T19:30:00-03:00");

    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("EN_VIVO");
    expect(formatearTiempoHastaReunion(inicio, ahora)).toBe("En curso");
  });
});

