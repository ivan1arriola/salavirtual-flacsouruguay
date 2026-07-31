import { describe, expect, it } from "vitest";
import {
  agruparPorMes,
  calcularMinutos,
  calcularMonto,
  rangoMesUtc3,
  resumirAsistencias,
  type RegistroAsistenciaPersonal
} from "../src/modules/asistencia/resumen-personal.domain";

const base: RegistroAsistenciaPersonal = {
  id: "a1",
  titulo: "Reunión",
  programa: "Programa",
  docente: "Docente",
  inicioAt: new Date("2026-07-10T13:00:00Z"),
  finAt: new Date("2026-07-10T15:00:00Z"),
  modalidad: "VIRTUAL",
  estado: "FINALIZADA",
  minutos: 120,
  tarifaHora: 400,
  monto: 800,
  moneda: "UYU"
};

describe("resumen personal de asistencias", () => {
  it("calcula el mes calendario en UTC-3", () => {
    expect(rangoMesUtc3(new Date("2026-07-31T23:00:00Z"))).toEqual({
      desdeMs: Date.parse("2026-07-01T03:00:00Z"),
      hastaMs: Date.parse("2026-08-01T03:00:00Z")
    });
  });

  it("prioriza minutos confirmados, luego reportados y finalmente fechas", () => {
    const programado = { inicio: base.inicioAt, fin: base.finAt };
    const real = { inicio: null, fin: null };
    expect(calcularMinutos(programado, 90, 100, real)).toBe(90);
    expect(calcularMinutos(programado, null, 100, real)).toBe(100);
    expect(calcularMinutos(programado, null, null, real)).toBe(120);
  });

  it("resume y agrupa sin modificar los registros", () => {
    const second = { ...base, id: "a2", inicioAt: new Date("2026-06-10T13:00:00Z"), modalidad: "HIBRIDA" as const, minutos: 60, monto: 500 };
    const records = Object.freeze([base, second]);
    expect(resumirAsistencias(records)).toEqual({ reuniones: 2, minutosVirtuales: 120, minutosHibridos: 60, monto: 1300 });
    expect(agruparPorMes(records).map(({ clave }) => clave)).toEqual(["2026-07", "2026-06"]);
    expect(calcularMonto(null, 400, 90)).toBe(600);
    expect(records).toHaveLength(2);
  });
});
