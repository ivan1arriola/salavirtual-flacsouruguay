import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatTime } from "../src/lib/ui/format";

describe("formato de fecha y hora", () => {
  it("usa horario UTC-3 con ciclo de 24 horas", () => {
    const formatted = formatDateTime(new Date("2026-08-03T13:05:00Z"));

    expect(formatted).toContain("10:05");
    expect(formatted).not.toMatch(/a\.\s?m\.|p\.\s?m\./i);
  });

  it("permite mostrar fecha y hora en columnas separadas", () => {
    const date = new Date("2026-08-03T13:05:00Z");

    expect(formatDate(date)).toMatch(/03.*ago/i);
    expect(formatTime(date)).toBe("10:05");
  });
});
