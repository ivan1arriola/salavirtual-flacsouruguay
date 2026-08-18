import { describe, expect, it } from "vitest";
import { encuentrosComienzanEnFuturo } from "../src/modules/reuniones/reuniones.domain";

describe("validación temporal de creación de reuniones", () => {
  const ahora = new Date("2026-08-18T18:00:00Z");

  it("acepta una serie cuando todos los encuentros empiezan después del momento actual", () => {
    expect(encuentrosComienzanEnFuturo([
      { inicio: new Date("2026-08-18T18:01:00Z") },
      { inicio: new Date("2026-08-25T18:00:00Z") }
    ], ahora)).toBe(true);
  });

  it("rechaza una serie si algún encuentro ya empezó o comienza exactamente ahora", () => {
    expect(encuentrosComienzanEnFuturo([
      { inicio: new Date("2026-08-18T17:59:00Z") },
      { inicio: new Date("2026-08-25T18:00:00Z") }
    ], ahora)).toBe(false);

    expect(encuentrosComienzanEnFuturo([
      { inicio: new Date("2026-08-18T18:00:00Z") }
    ], ahora)).toBe(false);
  });
});
