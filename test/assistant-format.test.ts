import { describe, expect, it } from "vitest";
import { formatMinutes, formatMoney, formatMonth } from "../src/lib/ui/assistant-format";

describe("formato de asistencia", () => {
  it("normaliza minutos negativos, redondea y soporta duraciones mayores a un día", () => {
    expect(formatMinutes(-10)).toBe("00:00");
    expect(formatMinutes(59.6)).toBe("01:00");
    expect(formatMinutes(90)).toBe("01:30");
    expect(formatMinutes(24 * 60 + 5)).toBe("24:05");
  });

  it("formatea importes con la moneda solicitada", () => {
    const expectedUyu = new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency: "UYU",
      maximumFractionDigits: 2,
    }).format(1234.5);
    const expectedUsd = new Intl.NumberFormat("es-UY", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    }).format(25.25);

    expect(formatMoney(1234.5)).toBe(expectedUyu);
    expect(formatMoney(25.25, "USD")).toBe(expectedUsd);
  });

  it("calcula el mes en Montevideo y capitaliza la etiqueta", () => {
    expect(formatMonth(new Date("2026-09-01T01:00:00Z"))).toBe("Agosto de 2026");
    expect(formatMonth(new Date("2026-09-01T03:00:00Z"))).toMatch(
      /^(Setiembre|Septiembre) de 2026$/,
    );
  });
});
