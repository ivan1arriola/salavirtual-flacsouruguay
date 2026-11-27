import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  crearReunionZoomHttp,
  eliminarReunionZoomHttp,
  obtenerReunionZoomHttp,
  obtenerZoomAccessToken,
} from "../src/integrations/zoom/zoom-client";

describe("Zoom Client", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("obtiene un access token y lo cachea", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: "test-token-123", expires_in: 3600 }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const token1 = await obtenerZoomAccessToken({
      accountId: "acc-1",
      clientId: "client-1",
      clientSecret: "secret-1",
    });
    expect(token1).toBe("test-token-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    // Segundo llamado usa cache
    const token2 = await obtenerZoomAccessToken({
      accountId: "acc-1",
      clientId: "client-1",
      clientSecret: "secret-1",
    });
    expect(token2).toBe("test-token-123");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("crea una reunión en Zoom con parámetros correctos", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 98765432100,
        join_url: "https://flacso.zoom.us/j/98765432100?pwd=xyz",
        start_url: "https://flacso.zoom.us/s/98765432100?zak=abc",
        password: "xyz",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await crearReunionZoomHttp("bearer-token", "sala1@flacso.edu.uy", {
      topic: "Clase de Posgrado",
      startTime: new Date("2026-11-02T14:00:00Z"),
      durationMinutes: 90,
      timezone: "America/Montevideo",
      requiereGrabacion: true,
    });

    expect(result.meetingId).toBe("98765432100");
    expect(result.joinUrl).toContain("98765432100");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.zoom.us/v2/users/sala1%40flacso.edu.uy/meetings",
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({
          Authorization: "Bearer bearer-token",
        }),
      }),
    );
  });

  it("elimina una reunión de Zoom de forma idempotente", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(eliminarReunionZoomHttp("bearer-token", "98765432100")).resolves.toBeUndefined();
  });

  it("recupera el enlace real de una reunión existente, incluido su passcode", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        id: 98765432100,
        join_url: "https://flacso.zoom.us/j/98765432100?pwd=xyz",
        start_url: "https://flacso.zoom.us/s/98765432100?zak=abc",
        password: "xyz",
      }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await obtenerReunionZoomHttp("bearer-token", "98765432100");

    expect(result.joinUrl).toBe("https://flacso.zoom.us/j/98765432100?pwd=xyz");
    expect(result.startUrl).toContain("zak=abc");
    expect(fetchMock).toHaveBeenCalledWith(
      "https://api.zoom.us/v2/meetings/98765432100",
      expect.objectContaining({ headers: { Authorization: "Bearer bearer-token" } }),
    );
  });
});
