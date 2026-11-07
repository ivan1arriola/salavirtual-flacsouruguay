import { describe, expect, it } from "vitest";
import {
  MAX_ZOOM_OCCURRENCES,
  calcularRecurrenciaZoom,
  detectarOcurrenciasSobrantes
} from "../src/modules/conferencias/domain/zoom-recurrence.domain";

describe("dominio de recurrencia Zoom (type 8)", () => {
  const tz = "America/Montevideo";

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

    it("calcula weekly_days con múltiples días (martes y jueves)", () => {
      // 2026-11-10 (mar), 2026-11-12 (jue)
      const instancias = [
        { inicio: new Date("2026-11-10T19:00:00-03:00"), fin: new Date("2026-11-10T21:00:00-03:00") },
        { inicio: new Date("2026-11-12T19:00:00-03:00"), fin: new Date("2026-11-12T21:00:00-03:00") }
      ];

      const res = calcularRecurrenciaZoom(instancias, tz);
      expect(res.recurrence.weeklyDays).toBe("3,5"); // Martes=3, Jueves=5
      expect(res.recurrence.endTimes).toBe(2);
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

    it("lanza error si supera el límite de ocurrencias de Zoom (50)", () => {
      const muchas = Array.from({ length: 51 }, (_, i) => ({
        inicio: new Date(Date.UTC(2026, 0, 1 + i, 18, 0)),
        fin: new Date(Date.UTC(2026, 0, 1 + i, 20, 0))
      }));
      expect(() => calcularRecurrenciaZoom(muchas, tz)).toThrow(/50/);
    });
  });

  describe("detectarOcurrenciasSobrantes", () => {
    it("detecta ocurrencias que Zoom generó en feriados salteados", () => {
      // Curso los martes semanas 1 y 3 (salteando semana 2 por feriado)
      const instancias = [
        { inicio: new Date("2026-11-10T18:00:00Z") },
        { inicio: new Date("2026-11-24T18:00:00Z") }
      ];

      // Zoom generó semana 1, 2 (feriado) y 3
      const zoomOcurrencias = [
        { occurrenceId: "occ-1", startTime: "2026-11-10T18:00:00Z" },
        { occurrenceId: "occ-feriado", startTime: "2026-11-17T18:00:00Z" },
        { occurrenceId: "occ-2", startTime: "2026-11-24T18:00:00Z" }
      ];

      const sobrantes = detectarOcurrenciasSobrantes(zoomOcurrencias, instancias, tz);

      expect(sobrantes).toEqual(["occ-feriado"]);
    });

    it("retorna lista vacía si todas las ocurrencias coinciden", () => {
      const instancias = [
        { inicio: new Date("2026-11-10T18:00:00Z") },
        { inicio: new Date("2026-11-17T18:00:00Z") }
      ];
      const zoomOcurrencias = [
        { occurrenceId: "occ-1", startTime: "2026-11-10T18:00:00Z" },
        { occurrenceId: "occ-2", startTime: "2026-11-17T18:00:00Z" }
      ];

      expect(detectarOcurrenciasSobrantes(zoomOcurrencias, instancias, tz)).toEqual([]);
    });
  });
});
