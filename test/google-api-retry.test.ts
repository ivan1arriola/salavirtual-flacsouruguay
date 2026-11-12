import { describe, expect, it, vi } from "vitest";
import { conReintentosPorLimiteGoogle, esLimiteTemporalGoogle } from "../src/integrations/google";

describe("reintentos por límites de Google", () => {
  it("reintenta 429 con espera exponencial y devuelve el resultado", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValue("ok");
    const esperar = vi.fn().mockResolvedValue(undefined);

    await expect(
      conReintentosPorLimiteGoogle(operation, {
        demoraBaseMs: 100,
        esperar
      })
    ).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([100, 200]);
  });

  it("reconoce el 403 rateLimitExceeded de Google", () => {
    expect(
      esLimiteTemporalGoogle({
        response: {
          status: 403,
          data: { error: { errors: [{ reason: "rateLimitExceeded" }] } }
        }
      })
    ).toBe(true);
  });

  it("no reintenta errores permanentes", async () => {
    const error = { response: { status: 400 } };
    const operation = vi.fn().mockRejectedValue(error);
    const esperar = vi.fn().mockResolvedValue(undefined);

    await expect(conReintentosPorLimiteGoogle(operation, { esperar })).rejects.toBe(error);
    expect(operation).toHaveBeenCalledTimes(1);
    expect(esperar).not.toHaveBeenCalled();
  });
});

import {
  conReintentosGoogleLectura,
  esFalloTemporalGoogle
} from "../src/integrations/google/retry/google-api-retry";
describe("reintentos seguros de lecturas Google", () => {
  it("no reintenta 403 de permisos y sí clasifica 429, 5xx y timeouts", async () => {
    const denied = {
      response: { status: 403, data: { error: { errors: [{ reason: "insufficientPermissions" }] } } }
    };
    const operation = vi.fn().mockRejectedValue(denied);
    await expect(conReintentosGoogleLectura(operation, { esperar: vi.fn() })).rejects.toBe(denied);
    expect(operation).toHaveBeenCalledOnce();
    expect(esFalloTemporalGoogle({ response: { status: 429 } })).toBe(true);
    expect(esFalloTemporalGoogle({ response: { status: 503 } })).toBe(true);
    expect(esFalloTemporalGoogle({ code: "ETIMEDOUT" })).toBe(true);
  });
  it("reintenta lectura ante 5xx y timeout", async () => {
    const op = vi
      .fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ code: "ETIMEDOUT" })
      .mockResolvedValue("ok");
    await expect(
      conReintentosGoogleLectura(op, { esperar: vi.fn().mockResolvedValue(undefined), aleatorio: () => 0 })
    ).resolves.toBe("ok");
    expect(op).toHaveBeenCalledTimes(3);
  });
});
