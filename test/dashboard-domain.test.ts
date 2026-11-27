import { describe, expect, it } from "vitest";
import {
  calcularNivelUrgenciaTriage,
  determinarEstadoTemporal,
  esMismoDiaMontevideo,
  formatearTiempoHastaReunion,
} from "../src/modules/dashboard/dashboard.domain";

describe("dashboard.domain", () => {
  const ahora = new Date("2026-09-11T18:00:00-03:00");

  it("clasifica una reunión como EN_VIVO 15 minutos antes del inicio y hasta el fin", () => {
    const inicio = new Date("2026-09-11T18:10:00-03:00");
    const fin = new Date("2026-09-11T20:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("EN_VIVO");
  });

  it("clasifica como PROXIMA_HOY si es más tarde el mismo día", () => {
    const inicio = new Date("2026-09-11T21:00:00-03:00");
    const fin = new Date("2026-09-11T23:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("PROXIMA_HOY");
  });

  it("clasifica como FUTURA si es en días posteriores", () => {
    const inicio = new Date("2026-09-12T10:00:00-03:00");
    const fin = new Date("2026-09-12T12:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("FUTURA");
  });

  it("clasifica como FINALIZADA si la hora actual superó el fin", () => {
    const inicio = new Date("2026-09-11T14:00:00-03:00");
    const fin = new Date("2026-09-11T16:00:00-03:00");
    expect(determinarEstadoTemporal(inicio, fin, ahora)).toBe("FINALIZADA");
  });

  it("formatea el tiempo restante en lenguaje humano sin efectos de reloj", () => {
    const inicioEn15Min = new Date("2026-09-11T18:15:00-03:00");
    expect(formatearTiempoHastaReunion(inicioEn15Min, ahora)).toBe("Empieza en 15 min");

    const inicioEn2Horas = new Date("2026-09-11T20:30:00-03:00");
    expect(formatearTiempoHastaReunion(inicioEn2Horas, ahora)).toBe("Empieza en 2 h 30 min");

    const yaComenzada = new Date("2026-09-11T17:50:00-03:00");
    expect(formatearTiempoHastaReunion(yaComenzada, ahora)).toBe("En curso");
  });

  it("identifica el mismo día en zona horaria America/Montevideo", () => {
    const d1 = new Date("2026-09-11T03:00:00Z"); // 00:00 en Montevideo
    const d2 = new Date("2026-09-11T23:00:00Z"); // 20:00 en Montevideo
    const d3 = new Date("2026-09-12T03:01:00Z"); // 00:01 del día siguiente en Montevideo
    expect(esMismoDiaMontevideo(d1, d2)).toBe(true);
    expect(esMismoDiaMontevideo(d1, d3)).toBe(false);
  });

  it("calcula nivel de urgencia de triage para reuniones sin asistente", () => {
    expect(calcularNivelUrgenciaTriage(2, false)).toBe("CRITICO");
    expect(calcularNivelUrgenciaTriage(6, false)).toBe("MODERADO");
    expect(calcularNivelUrgenciaTriage(24, false)).toBe("NORMAL");
    expect(calcularNivelUrgenciaTriage(1, true)).toBe("NORMAL");
  });
});
