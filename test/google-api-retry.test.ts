import { describe, expect, it, vi } from "vitest";
import {
  conReintentosPorLimiteGoogle,
  esLimiteTemporalGoogle
} from "../src/modules/meet/google-api-retry.adapter";

describe("reintentos por límites de Google", () => {
  it("reintenta 429 con espera exponencial y devuelve el resultado", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockRejectedValueOnce({ response: { status: 429 } })
      .mockResolvedValue("ok");
    const esperar = vi.fn().mockResolvedValue(undefined);

    await expect(conReintentosPorLimiteGoogle(operation, {
      demoraBaseMs: 100,
      esperar
    })).resolves.toBe("ok");
    expect(operation).toHaveBeenCalledTimes(3);
    expect(esperar.mock.calls.map(([milliseconds]) => milliseconds)).toEqual([100, 200]);
  });

  it("reconoce el 403 rateLimitExceeded de Google", () => {
    expect(esLimiteTemporalGoogle({
      response: {
        status: 403,
        data: { error: { errors: [{ reason: "rateLimitExceeded" }] } }
      }
    })).toBe(true);
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
