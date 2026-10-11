import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import {
  conReintentosGoogleLectura, esFalloTemporalGoogle,
  obtenerEventoCalendar, listarMiembrosMeetHttp, obtenerOCrearCarpetaDrive,
} from "../src/integrations/google";

describe("Google: reintentos seguros para lecturas", () => {
  it("reintenta 503 y desconexiones transitorias sin exceder intentos", async () => {
    const operation = vi.fn()
      .mockRejectedValueOnce({ response: { status: 503 } })
      .mockRejectedValueOnce({ code: "ECONNRESET" })
      .mockResolvedValue("ok");
    const delays: number[] = [];
    expect(await conReintentosGoogleLectura(operation, {
      demoraBaseMs: 100, aleatorio: () => 1,
      esperar: async (ms) => { delays.push(ms); },
    })).toBe("ok");
    expect(delays).toEqual([100, 200]);
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it("respeta Retry-After segundos y fecha HTTP, con un máximo de espera", async () => {
    const delays: number[] = [];
    const operation = vi.fn().mockRejectedValueOnce({
      response: { status: 429, headers: { "Retry-After": "120" } }
    }).mockResolvedValue("ok");
    await conReintentosGoogleLectura(operation, {
      demoraBaseMs: 100, demoraMaximaMs: 3_000,
      aleatorio: () => 1, esperar: async (n) => { delays.push(n); },
    });
    expect(delays).toEqual([3_000]);

    const second: number[] = [];
    const fixed = Date.parse("2026-10-11T13:00:00Z");
    await conReintentosGoogleLectura(
      vi.fn().mockRejectedValueOnce({
        response: { status: 503, headers: new Headers({ "retry-after": new Date(fixed + 2200).toUTCString() }) }
      }).mockResolvedValue("ok"),
      { demoraBaseMs: 100, aleatorio: () => 1, ahora: () => fixed,
        esperar: async (n) => { second.push(n); } }
    );
    expect(second).toEqual([2_000]);
  });

  it("no reintenta permisos, token vencido ni límites diarios permanentes", async () => {
    const cases = [
      { response: { status: 401 } },
      { response: { status: 403, data: { error: { errors: [{ reason: "insufficientPermissions" }] } } } },
      { response: { status: 403, data: { error: { errors: [{ reason: "dailyLimitExceeded" }] } } } },
      { response: { status: 400 } },
    ];
    for (const error of cases) {
      const request = vi.fn().mockRejectedValue(error);
      await expect(conReintentosGoogleLectura(request, {
        esperar: async () => { throw new Error("No se debería esperar."); }
      })).rejects.toBe(error);
      expect(request).toHaveBeenCalledTimes(1);
    }
  });

  it("agota los intentos configurados sin un bucle ilimitado", async () => {
    const operation = vi.fn().mockRejectedValue({ response: { status: 502 } });
    await expect(conReintentosGoogleLectura(operation, {
      intentosMaximos: 3, aleatorio: () => 1, esperar: async () => undefined
    })).rejects.toMatchObject({ response: { status: 502 } });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(esFalloTemporalGoogle({ code: "ETIMEDOUT" })).toBe(true);
    expect(esFalloTemporalGoogle({ code: "ENOTFOUND" })).toBe(false);
  });

  it("Calendar GET reintenta un fallo temporal, POST no participa", async () => {
    const request = vi.fn().mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { id: "evento-1" } });
    const auth = { request } as unknown as JWT;
    expect((await obtenerEventoCalendar(auth, "primary", "evento-1")).id).toBe("evento-1");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([args]) => args.method === "GET")).toBe(true);
  });

  it("Meet detecta bucles de paginación sin seguir consultando indefinidamente", async () => {
    const request = vi.fn().mockResolvedValue({ data: {
      members: [], nextPageToken: "repeated"
    } });
    const auth = { request } as unknown as JWT;
    await expect(listarMiembrosMeetHttp(auth, "spaces/test"))
      .rejects.toThrow("token de paginación");
    expect(request).toHaveBeenCalledTimes(2);
  });

  it("Drive limita reintentos a la búsqueda GET y nunca recrea automáticamente", async () => {
    const request = vi.fn().mockRejectedValueOnce({ response: { status: 503 } })
      .mockResolvedValueOnce({ data: { files: [{ id: "folder-1" }] } });
    const auth = { request } as unknown as JWT;
    expect(await obtenerOCrearCarpetaDrive(auth, "parent-1", "Clases")).toBe("folder-1");
    expect(request).toHaveBeenCalledTimes(2);
    expect(request.mock.calls.every(([args]) => args.method === "GET")).toBe(true);
  });
});
