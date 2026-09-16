import { describe, expect, it } from "vitest";
import { derivarEstadoReunion } from "../src/modules/asistencia/estado-reunion";

const inicio = new Date("2026-09-16T18:30:00-03:00");
const fin = new Date("2026-09-16T20:00:00-03:00");

describe("derivarEstadoReunion", () => {
  it("devuelve PROGRAMADA antes del horario", () => {
    expect(derivarEstadoReunion({ ahora: new Date("2026-09-16T18:00:00-03:00"), inicio, fin, conferenciaInicio: null, conferenciaFin: null })).toBe("PROGRAMADA");
  });

  it("devuelve ESPERANDO_INICIO al llegar la hora sin conferencia", () => {
    expect(derivarEstadoReunion({ ahora: new Date("2026-09-16T18:40:00-03:00"), inicio, fin, conferenciaInicio: null, conferenciaFin: null })).toBe("ESPERANDO_INICIO");
  });

  it("devuelve EN_CURSO con conferencia iniciada y no finalizada", () => {
    expect(derivarEstadoReunion({ ahora: new Date("2026-09-16T18:45:00-03:00"), inicio, fin, conferenciaInicio: new Date("2026-09-16T18:42:00-03:00"), conferenciaFin: null })).toBe("EN_CURSO");
  });

  it("devuelve FINALIZADA si la conferencia terminó", () => {
    expect(derivarEstadoReunion({ ahora: new Date("2026-09-16T20:10:00-03:00"), inicio, fin, conferenciaInicio: new Date("2026-09-16T18:42:00-03:00"), conferenciaFin: new Date("2026-09-16T20:03:00-03:00") })).toBe("FINALIZADA");
  });

  it("devuelve NO_INICIADA al terminar la franja sin conferencia", () => {
    expect(derivarEstadoReunion({ ahora: new Date("2026-09-16T20:01:00-03:00"), inicio, fin, conferenciaInicio: null, conferenciaFin: null })).toBe("NO_INICIADA");
  });
});
