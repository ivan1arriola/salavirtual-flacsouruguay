import { afterEach, describe, expect, it, vi } from "vitest";
import { actualizarReunionZoomHttp, crearReunionZoomHttp } from "../src/integrations/zoom/zoom-client";

afterEach(() => vi.unstubAllGlobals());

const reunion = {
  topic: "t",
  startTime: new Date("2026-11-20T12:00:00Z"),
  durationMinutes: 60,
  timezone: "UTC"
};

describe("llamadas de reunión a Zoom", () => {
  it("crear una reunión no tiene límite de espera: abortar dejaría una reunión huérfana y el reintento la duplicaría", async () => {
    const fetchMock = vi.fn(
      async () => new Response(JSON.stringify({ id: 1, join_url: "u" }), { status: 201 })
    );
    vi.stubGlobal("fetch", fetchMock);
    await crearReunionZoomHttp("tok", "h@flacso.edu.uy", reunion);
    const opciones = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(opciones.signal).toBeUndefined();
  });

  it("actualizar sí tiene límite de espera (repetirla es seguro)", async () => {
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    await actualizarReunionZoomHttp("tok", "123", { topic: "x" }).catch(() => undefined);
    const opciones = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it("un rechazo de Zoom deja el motivo en el registro del servidor, no en el mensaje que se guarda", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response('{"code":1010,"message":"detalle interno"}', {
            status: 400,
            statusText: "Bad Request"
          })
      )
    );
    const error = await crearReunionZoomHttp("tok", "h@flacso.edu.uy", reunion).catch((e: Error) => e);
    expect((error as Error).message).toBe("Zoom API error al crear reunión (400): Bad Request");
    expect(consoleError).toHaveBeenCalledWith(
      "Zoom API",
      "crear reunión",
      400,
      expect.stringContaining("detalle interno")
    );
    consoleError.mockRestore();
  });
});
