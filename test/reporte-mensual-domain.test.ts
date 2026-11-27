import { describe, expect, it } from "vitest";
import {
  construirCorreoReporteMensual,
  etiquetaMes,
  formatearDuracion,
  periodoMesAnteriorUtc3,
} from "../src/modules/asistencia/reporte-mensual.domain";

describe("reporte mensual de asistencia técnica", () => {
  it("calcula el mes anterior en horario de Montevideo", () => {
    const periodo = periodoMesAnteriorUtc3(new Date("2026-09-01T12:00:00.000Z"));
    expect(periodo.clave).toBe("2026-08");
    expect(periodo.desdeMs).toBe(Date.parse("2026-08-01T03:00:00.000Z"));
    expect(periodo.hastaMs).toBe(Date.parse("2026-09-01T03:00:00.000Z"));
  });

  it("resuelve correctamente el cambio de año", () => {
    const periodo = periodoMesAnteriorUtc3(new Date("2027-01-01T12:00:00.000Z"));
    expect(periodo.clave).toBe("2026-12");
    expect(periodo.desdeMs).toBe(Date.parse("2026-12-01T03:00:00.000Z"));
    expect(periodo.hastaMs).toBe(Date.parse("2027-01-01T03:00:00.000Z"));
  });

  it("formatea horas y minutos sin perder precisión administrativa", () => {
    expect(formatearDuracion(0)).toBe("0 h");
    expect(formatearDuracion(60)).toBe("1 h");
    expect(formatearDuracion(95)).toBe("1 h 35 min");
  });

  it("conserva una etiqueta inválida en lugar de inventar una fecha", () => {
    expect(etiquetaMes("periodo-invalido")).toBe("periodo-invalido");
  });

  it("construye un correo con total y desglose", () => {
    const correo = construirCorreoReporteMensual({
      nombre: "Ana",
      periodo: "2026-08",
      resumen: {
        reuniones: 3,
        minutosVirtuales: 120,
        minutosHibridos: 90,
        montoVirtual: 0,
        montoHibrido: 0,
        monto: 0,
      },
    });
    expect(correo.subject).toContain("Agosto de 2026");
    expect(correo.text).toContain("3 h 30 min");
    expect(correo.text).toContain("3,50 horas");
    expect(correo.text).toContain("Reuniones: 3");
    expect(correo.text).toContain("respondé a todos");
  });
});
