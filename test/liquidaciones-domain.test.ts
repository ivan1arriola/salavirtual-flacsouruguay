import { describe, expect, it } from "vitest";
import {
  calcularMinutos,
  calcularMonto,
  claveMesUtc3,
  construirCorreoReporteMensual,
  etiquetaMes,
  formatearDuracion,
  formatearHorasDecimales,
  minutosTotales,
  periodoMesAnteriorUtc3,
  rangoMesUtc3,
  resolverPeriodoMes,
  resumirAsignacionesPorAsistente,
  resumirAsistencias,
  resumirMontos,
  resumirTotales,
  type AsignacionResumenAdministracion,
  type AsistenteResumenBase,
  type RegistroAsistenciaLiquidacion,
  type ResumenAsistencia,
} from "@/src/modules/liquidaciones/domain";

describe("liquidaciones domain", () => {
  describe("calculo de horas y montos", () => {
    it("calcula minutos usando la prioridad: confirmado > reportado > real > programado", () => {
      const programado = {
        inicio: new Date("2026-05-10T10:00:00Z"),
        fin: new Date("2026-05-10T11:00:00Z"),
      };
      const real = {
        inicio: new Date("2026-05-10T10:00:00Z"),
        fin: new Date("2026-05-10T11:30:00Z"),
      };

      expect(calcularMinutos(programado, 45, 90, real)).toBe(45);
      expect(calcularMinutos(programado, null, 90, real)).toBe(90);
      expect(calcularMinutos(programado, null, null, real)).toBe(90);
      expect(calcularMinutos(programado, null, null, { inicio: null, fin: null })).toBe(60);
    });

    it("calcula monto usando confirmado o tarifaHora * minutos / 60", () => {
      expect(calcularMonto(1500, 500, 120)).toBe(1500);
      expect(calcularMonto(null, 600, 90)).toBe(900);
      expect(calcularMonto(null, null, 90)).toBeNull();
    });

    it("calcula rangos y claves mensuales en UTC-3", () => {
      const fecha = new Date("2026-05-15T15:00:00Z");
      expect(claveMesUtc3(fecha)).toBe("2026-05");
      const rango = rangoMesUtc3(fecha);
      expect(new Date(rango.desdeMs).toISOString()).toBe("2026-05-01T03:00:00.000Z");
      expect(new Date(rango.hastaMs).toISOString()).toBe("2026-06-01T03:00:00.000Z");
    });

    it("resuelve periodo de mes y periodo anterior cruzando año", () => {
      const ahoraEnero = new Date("2026-01-15T12:00:00Z");
      const periodo = periodoMesAnteriorUtc3(ahoraEnero);
      expect(periodo.clave).toBe("2025-12");

      const resuelto = resolverPeriodoMes("2026-03", ahoraEnero);
      expect(resuelto.clave).toBe("2026-03");
      expect(resuelto.anterior).toBe("2026-02");
      expect(resuelto.siguiente).toBe("2026-04");
    });

    it("formatea duraciones y horas decimales correctamente", () => {
      expect(formatearDuracion(60)).toBe("1 h");
      expect(formatearDuracion(90)).toBe("1 h 30 min");
      expect(formatearHorasDecimales(90)).toBe("1,50");
      expect(etiquetaMes("2026-05")).toBe("mayo de 2026");
    });
  });

  describe("resumen de liquidaciones", () => {
    it("resume asignaciones por asistente y totales", () => {
      const asistentes: readonly AsistenteResumenBase[] = [
        {
          id: "asist-1",
          usuarioId: "u-1",
          slug: "juan",
          nombre: "Juan Perez",
          email: "juan@flacso.edu.uy",
          activo: true,
        },
      ];
      const asignaciones: readonly AsignacionResumenAdministracion[] = [
        {
          asistenteTecnicoId: "asist-1",
          modalidad: "VIRTUAL",
          minutos: 60,
          monto: 500,
          moneda: "UYU",
        },
        {
          asistenteTecnicoId: "asist-1",
          modalidad: "HIBRIDA",
          minutos: 120,
          monto: 1200,
          moneda: "UYU",
        },
      ];

      const filas = resumirAsignacionesPorAsistente(asistentes, asignaciones);
      expect(filas).toHaveLength(1);
      expect(filas[0].reuniones).toBe(2);
      expect(filas[0].virtuales).toBe(1);
      expect(filas[0].hibridas).toBe(1);
      expect(filas[0].minutos).toBe(180);
      expect(filas[0].montos).toEqual([{ moneda: "UYU", monto: 1700 }]);
      expect(filas[0].sinTarifa).toBe(0);

      const totales = resumirTotales(filas);
      expect(totales.asistentes).toBe(1);
      expect(totales.reuniones).toBe(2);
      expect(totales.minutos).toBe(180);
      expect(totales.montos).toEqual([{ moneda: "UYU", monto: 1700 }]);
    });

    it("resume asistencias personales correctamente", () => {
      const asistencias: readonly RegistroAsistenciaLiquidacion[] = [
        { modalidad: "VIRTUAL", minutos: 60, monto: 500 },
        { modalidad: "HIBRIDA", minutos: 120, monto: 1200 },
      ];
      const resumen = resumirAsistencias(asistencias);
      expect(resumen.reuniones).toBe(2);
      expect(resumen.minutosVirtuales).toBe(60);
      expect(resumen.minutosHibridos).toBe(120);
      expect(resumen.montoVirtual).toBe(500);
      expect(resumen.montoHibrido).toBe(1200);
      expect(resumen.monto).toBe(1700);
      expect(minutosTotales(resumen)).toBe(180);
    });

    it("resume montos agrupando por moneda", () => {
      const items = [
        { monto: 100, moneda: "UYU" },
        { monto: 200, moneda: "UYU" },
        { monto: 50, moneda: "USD" },
      ];
      const res = resumirMontos(items);
      expect(res).toEqual([
        { moneda: "UYU", monto: 300 },
        { moneda: "USD", monto: 50 },
      ]);
    });
  });

  describe("reporte mensual", () => {
    it("construye el correo de reporte mensual con formato seguro", () => {
      const resumen: ResumenAsistencia = {
        reuniones: 3,
        minutosVirtuales: 120,
        minutosHibridos: 60,
        montoVirtual: 1000,
        montoHibrido: 600,
        monto: 1600,
      };
      const correo = construirCorreoReporteMensual({
        nombre: "María & Co.",
        periodo: "2026-05",
        resumen,
      });

      expect(correo.subject).toContain("Mayo de 2026");
      expect(correo.text).toContain("3 h");
      expect(correo.text).toContain("3,00 horas");
      expect(correo.html).toContain("María &amp; Co.");
      expect(correo.html).toContain("3 h");
    });
  });
});
