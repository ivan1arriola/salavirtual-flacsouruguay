import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/lib/ui/format";

describe("formatDuration", () => {
  it("formatea minutos menores a una hora", () => {
    const inicio = new Date("2026-11-03T10:00:00Z");
    const fin = new Date("2026-11-03T10:45:00Z");
    expect(formatDuration(inicio, fin)).toBe("45 min");
  });

  it("formatea horas exactas", () => {
    const inicio = new Date("2026-11-03T10:00:00Z");
    const fin = new Date("2026-11-03T12:00:00Z");
    expect(formatDuration(inicio, fin)).toBe("2 h");
  });

  it("formatea horas y minutos combinados", () => {
    const inicio = new Date("2026-11-03T10:00:00Z");
    const fin = new Date("2026-11-03T11:30:00Z");
    expect(formatDuration(inicio, fin)).toBe("1 h 30 min");
  });

  it("maneja diferencias nulas o negativas devolviendo 0 min", () => {
    const inicio = new Date("2026-11-03T10:00:00Z");
    expect(formatDuration(inicio, inicio)).toBe("0 min");
    const antes = new Date("2026-11-03T09:00:00Z");
    expect(formatDuration(inicio, antes)).toBe("0 min");
  });
});

