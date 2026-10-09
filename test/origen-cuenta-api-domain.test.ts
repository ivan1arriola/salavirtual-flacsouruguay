import { describe, expect, it } from "vitest";
import { fueCreadoConCuentaApiAnterior } from "../src/modules/meet/origen-cuenta-api.domain";

describe("origen de cuenta API", () => {
  it("marca como anterior un evento creado antes del cambio de credencial", () => {
    expect(fueCreadoConCuentaApiAnterior(
      new Date("2026-09-20T12:00:00Z"),
      new Date("2026-09-25T15:00:00Z")
    )).toBe(true);
  });

  it("no marca un evento creado después del cambio de credencial", () => {
    expect(fueCreadoConCuentaApiAnterior(
      new Date("2026-09-26T12:00:00Z"),
      new Date("2026-09-25T15:00:00Z")
    )).toBe(false);
  });

  it("no infiere una cuenta anterior sin un cambio de credencial registrado", () => {
    expect(fueCreadoConCuentaApiAnterior(new Date("2026-09-20T12:00:00Z"), null)).toBe(false);
  });
});
