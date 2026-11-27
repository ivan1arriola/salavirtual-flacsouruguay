import { describe, expect, it } from "vitest";
import { particionarPeriodoZoom } from "../src/modules/archivos/domain/zoom-recuperacion.domain";

const DIA = 86400000;

describe("particionarPeriodoZoom", () => {
  it("un solo dia produce una ventana", () => {
    expect(particionarPeriodoZoom("2026-03-01", "2026-03-01")).toEqual([
      { desde: "2026-03-01", hasta: "2026-03-01" },
    ]);
  });

  it("30 dias inclusivos caben en una ventana y 31 requieren dos", () => {
    expect(particionarPeriodoZoom("2026-03-01", "2026-03-30")).toEqual([
      { desde: "2026-03-01", hasta: "2026-03-30" },
    ]);
    expect(particionarPeriodoZoom("2026-03-01", "2026-03-31")).toEqual([
      { desde: "2026-03-01", hasta: "2026-03-30" },
      { desde: "2026-03-31", hasta: "2026-03-31" },
    ]);
  });

  it("no deja huecos ni solapes y respeta limites de ano", () => {
    const ventanas = particionarPeriodoZoom("2025-12-15", "2026-03-10");
    expect(ventanas[0].desde).toBe("2025-12-15");
    expect(ventanas[ventanas.length - 1].hasta).toBe("2026-03-10");
    ventanas.forEach((v, i) => {
      const dias = (Date.parse(v.hasta) - Date.parse(v.desde)) / DIA + 1;
      expect(dias).toBeLessThanOrEqual(30);
      if (i > 0) {
        expect(Date.parse(v.desde) - Date.parse(ventanas[i - 1].hasta)).toBe(DIA);
      }
    });
    expect(ventanas[0].hasta).toBe("2026-01-13");
  });

  it("cruza el 29 de febrero de un ano bisiesto", () => {
    expect(particionarPeriodoZoom("2028-02-15", "2028-03-15")).toEqual([
      { desde: "2028-02-15", hasta: "2028-03-15" },
    ]);
    expect(particionarPeriodoZoom("2028-02-01", "2028-03-02")).toEqual([
      { desde: "2028-02-01", hasta: "2028-03-01" },
      { desde: "2028-03-02", hasta: "2028-03-02" },
    ]);
  });

  it("admite un tamano de ventana propio (28 dias) en bisiesto y limite de ano", () => {
    expect(particionarPeriodoZoom("2028-02-01", "2028-03-01", 28)).toEqual([
      { desde: "2028-02-01", hasta: "2028-02-28" },
      { desde: "2028-02-29", hasta: "2028-03-01" },
    ]);
    expect(particionarPeriodoZoom("2026-12-10", "2027-01-10", 28)).toEqual([
      { desde: "2026-12-10", hasta: "2027-01-06" },
      { desde: "2027-01-07", hasta: "2027-01-10" },
    ]);
    expect(() => particionarPeriodoZoom("2026-03-01", "2026-03-02", 0)).toThrow();
  });

  it("rechaza fechas invalidas o rango invertido", () => {
    expect(() => particionarPeriodoZoom("2026-02-30", "2026-03-01")).toThrow();
    expect(() => particionarPeriodoZoom("2026-03-02", "2026-03-01")).toThrow();
    expect(() => particionarPeriodoZoom("hoy", "2026-03-01")).toThrow();
  });
});
