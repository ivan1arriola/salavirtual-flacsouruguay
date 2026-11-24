import { describe, expect, it } from "vitest";
import { formatDuration } from "../src/lib/ui/format";

describe("formatDuration", () => {
  it.each([
    ["2026-11-03T10:45:00Z", "45 min"],
    ["2026-11-03T12:00:00Z", "2 h"],
    ["2026-11-03T11:30:00Z", "1 h 30 min"]
  ])("formatea %s como %s", (fin, esperado) => {
    const inicio = new Date("2026-11-03T10:00:00Z");
    expect(formatDuration(inicio, new Date(fin))).toBe(esperado);
  });

  it("maneja diferencias nulas o negativas devolviendo 0 min", () => {
    const inicio = new Date("2026-11-03T10:00:00Z");
    expect(formatDuration(inicio, inicio)).toBe("0 min");
    const antes = new Date("2026-11-03T09:00:00Z");
    expect(formatDuration(inicio, antes)).toBe("0 min");
  });
});
