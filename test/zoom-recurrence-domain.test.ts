import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM_OCCURRENCES,
  calcularRecurrenciaZoom,
  calcularSlotsZoom,
  detectarOcurrenciasSobrantes,
  detectarOcurrenciasAjustar
} from "../src/modules/conferencias/domain/zoom-recurrence.domain";

describe("dominio de recurrencia Zoom (type 8)", () => {
  const tz = "America/Montevideo";

  describe("calcularSlotsZoom", () => {
    it("calcula slots para una sola fecha", () => {
      const fecha = new Date("2026-11-10T18:00:00-03:00");
      expect(calcularSlotsZoom(fecha, fecha, [3], tz)).toBe(1);
    });

    it("calcula slots para 3 martes consecutivos", () => {
      const f1 = new Date("2026-11-10T18:00:00-03:00");
      const f3 = new Date("2026-11-24T18:00:00-03:00");
      expect(calcularSlotsZoom(f1, f3, [3], tz)).toBe(3);
    });

    it("calcula slots para martes y jueves en 2 semanas", () => {
      const f1 = new Date("2026-11-10T18:00:00-03:00"); // Mar 10
      const f4 = new Date("2026-11-19T18:00:00-03:00"); // Jue 19
      // Mar 10, Jue 12, Mar 17, Jue 19 = 4 slots
      expect(calcularSlotsZoom(f1, f4, [3, 5], tz)).toBe(4);
    });
  });

  describe("calcularRecurrenciaZoom", () => {
    it("calcula la regla semanal para martes consecutivos", () => {
      // 2026-11-10 es martes
      const instancias = [
        { inicio: new Date("2026-11-10T18:00:00-03:00"), fin: new Date("2026-11-10T20:00:00-03:00") },
        { inicio: new Date("2026-11-17T18:00:00-03:00"), fin: new Date("2026-11-17T20:00:00-03:00") },
        { inicio: new Date("2026-11-24T18:00:00-03:00"), fin: new Date("2026-11-24T20:00:00-03:00") }
      ];

      const res = calcularRecurrenciaZoom(instancias, tz);

      expect(res.startTime).toEqual(instancias[0].inicio);
      expect(res.durationMinutes).toBe(120);
      expect(res.recurrence).toEqual({
        type: 2,
        repeatInterval: 1,
        weeklyDays: "3", // Martes en Zoom es 3
        endTimes: 3
      });
    });

    it("calcula endTimes extendido cuando hay feriados o huecos intermedios", () => {
      // Martes 10/11, feriado el 17/11, clase el 24/11
      const instancias = [
        { inicio: new Date("2026-11-10T18:00:00-03:00"), fin: new Date("2026-11-10T20:00:00-03:00") },
        { inicio: new Date("2026-11-24T18:00:00-03:00"), fin: new Date("2026-11-24T20:00:00-03:00") }
      ];

      const res = calcularRecurrenciaZoom(instancias, tz);

      expect(res.recurrence.weeklyDays).toBe("3");
      // Debe generar 3 ocurrencias en Zoom para llegar al 24/11 (10/11, 17/11 feriado, 24/11)
      expect(res.recurrence.endTimes).toBe(3);
    });

    it("calcula weekly_days con múltiples días (martes y jueves) con feriado", () => {
      // Mar 10, Jue 12, (Mar 17 feriado), Jue 19, Mar 24
      const instancias = [
        { inicio: new Date("2026-11-10T19:00:00-03:00"), fin: new Date("2026-11-10T21:00:00-03:00") },
        { inicio: new Date("2026-11-12T19:00:00-03:00"), fin: new Date("2026-11-12T21:00:00-03:00") },
        { inicio: new Date("2026-11-19T19:00:00-03:00"), fin: new Date("2026-11-19T21:00:00-03:00") },
        { inicio: new Date("2026-11-24T19:00:00-03:00"), fin: new Date("2026-11-24T21:00:00-03:00") }
      ];

      const res = calcularRecurrenciaZoom(instancias, tz);
      expect(res.recurrence.weeklyDays).toBe("3,5");
      // Total slots en el patrón: mar 10, jue 12, mar 17 (feriado), jue 19, mar 24 = 5 slots
      expect(res.recurrence.endTimes).toBe(5);
    });

    it("ordena cronológicamente si las instancias no vienen en orden", () => {
      const i1 = { inicio: new Date("2026-11-10T19:00:00-03:00"), fin: new Date("2026-11-10T21:00:00-03:00") };
      const i2 = { inicio: new Date("2026-11-17T19:00:00-03:00"), fin: new Date("2026-11-17T21:00:00-03:00") };

      const res = calcularRecurrenciaZoom([i2, i1], tz);
      expect(res.startTime).toEqual(i1.inicio);
    });

    it("lanza error si la lista está vacía", () => {
      expect(() => calcularRecurrenciaZoom([], tz)).toThrow(/vacía/i);
    });

    it("lanza error si la cantidad de instancias supera 50", () => {
      const muchas = Array.from({ length: 51 }, (_, i) => ({
        inicio: new Date(Date.UTC(2026, 0, 1 + i, 18, 0)),
        fin: new Date(Date.UTC(2026, 0, 1 + i, 20, 0))
      }));
      expect(() => calcularRecurrenciaZoom(muchas, tz)).toThrow(/50/);
    });

    it("lanza error si los slots semanales requeridos por huecos superan 50", () => {
      // 2 clases separadas por 52 semanas
      const instancias = [
        { inicio: new Date("2026-01-06T18:00:00-03:00"), fin: new Date("2026-01-06T20:00:00-03:00") },
        { inicio: new Date("2027-01-05T18:00:00-03:00"), fin: new Date("2027-01-05T20:00:00-03:00") }
      ];
      expect(() => calcularRecurrenciaZoom(instancias, tz)).toThrow(/50/);
    });
  });

  describe("detectarOcurrenciasSobrantes", () => {
    it("detecta ocurrencias que Zoom generó en feriados salteados", () => {
      // Curso los martes semanas 1 y 3 (salteando semana 2 por feriado)
      const instancias = [
        { inicio: new Date("2026-11-10T18:00:00-03:00") },
        { inicio: new Date("2026-11-24T18:00:00-03:00") }
      ];

      // Zoom generó semana 1, 2 (feriado) y 3
      const zoomOcurrencias = [
        { occurrenceId: "occ-1", startTime: "2026-11-10T21:00:00Z" },
        { occurrenceId: "occ-feriado", startTime: "2026-11-17T21:00:00Z" },
        { occurrenceId: "occ-2", startTime: "2026-11-24T21:00:00Z" }
      ];

      const sobrantes = detectarOcurrenciasSobrantes(zoomOcurrencias, instancias, tz);

      expect(sobrantes).toEqual(["occ-feriado"]);
    });

    it("retorna lista vacía si todas las ocurrencias coinciden", () => {
      const instancias = [
        { inicio: new Date("2026-11-10T18:00:00-03:00") },
        { inicio: new Date("2026-11-17T18:00:00-03:00") }
      ];
      const zoomOcurrencias = [
        { occurrenceId: "occ-1", startTime: "2026-11-10T21:00:00Z" },
        { occurrenceId: "occ-2", startTime: "2026-11-17T21:00:00Z" }
      ];

      expect(detectarOcurrenciasSobrantes(zoomOcurrencias, instancias, tz)).toEqual([]);
    });
  });

  describe("detectarOcurrenciasAjustar", () => {
    it("detecta si una ocurrencia tiene hora de inicio o duración distinta a la planificada", () => {
      // Clase 1: 18:00 a 20:00 (120 min)
      // Clase 2: 19:00 a 20:30 (90 min)
      const instancias = [
        { inicio: new Date("2026-11-10T18:00:00-03:00"), fin: new Date("2026-11-10T20:00:00-03:00") },
        { inicio: new Date("2026-11-17T19:00:00-03:00"), fin: new Date("2026-11-17T20:30:00-03:00") }
      ];

      // Zoom generó ambas a las 18:00 (21:00 UTC) y 120 min de duración
      const zoomOcurrencias = [
        { occurrenceId: "occ-1", startTime: "2026-11-10T21:00:00Z", duration: 120 },
        { occurrenceId: "occ-2", startTime: "2026-11-17T21:00:00Z", duration: 120 }
      ];

      const aAjustar = detectarOcurrenciasAjustar(zoomOcurrencias, instancias, tz);

      expect(aAjustar).toEqual([
        {
          occurrenceId: "occ-2",
          startTime: instancias[1].inicio,
          durationMinutes: 90
        }
      ]);
    });
  });
});
