import { afterEach, describe, expect, it, vi } from "vitest";
import {
  crearProveedorTokenZoom,
  invalidarZoomAccessToken,
  obtenerZoomAccessToken
} from "@/src/integrations/zoom/zoom-client";

afterEach(() => vi.unstubAllGlobals());

function oauthMock(tokens: string[]) {
  let i = 0;
  return vi.fn(
    async () => new Response(JSON.stringify({ access_token: tokens[i++], expires_in: 3600 }), { status: 200 })
  );
}

describe("caché de tokens de Zoom", () => {
  it("un secreto distinto no reutiliza el token cacheado del secreto válido", async () => {
    const fetchMock = oauthMock(["token-valido", "token-otro"]);
    vi.stubGlobal("fetch", fetchMock);
    const base = { accountId: "acc-sec-1", clientId: "cli-sec-1" };
    expect(await obtenerZoomAccessToken({ ...base, clientSecret: "correcto" })).toBe("token-valido");
    expect(await obtenerZoomAccessToken({ ...base, clientSecret: "mal-escrito" })).toBe("token-otro");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("la solicitud del token tiene límite de espera", async () => {
    const fetchMock = oauthMock(["t"]);
    vi.stubGlobal("fetch", fetchMock);
    await obtenerZoomAccessToken({ accountId: "acc-sec-2", clientId: "cli-sec-2", clientSecret: "s" });
    const opciones = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(opciones.signal).toBeInstanceOf(AbortSignal);
  });

  it("el error de autenticación no incluye el cuerpo de la respuesta", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("detalle interno de zoom", { status: 400, statusText: "Bad Request" }))
    );
    const error = await obtenerZoomAccessToken({ accountId: "a3", clientId: "c3", clientSecret: "s" }).catch(
      (e: Error) => e
    );
    expect((error as Error).message).toContain("400");
    expect((error as Error).message).not.toContain("detalle interno");
  });
});

describe("renovación forzada del token Zoom", () => {
  it("invalida el token rechazado y entrega uno distinto desde el caché real", async () => {
    const creds = { accountId: "acc-inv-1", clientId: "cli-inv-1", clientSecret: "s" };
    const fetchMock = oauthMock(["token-viejo", "token-nuevo"]);
    vi.stubGlobal("fetch", fetchMock);
    const primero = await obtenerZoomAccessToken(creds);
    const segundo = await invalidarZoomAccessToken(creds, primero);
    expect(primero).toBe("token-viejo");
    expect(segundo).toBe("token-nuevo");
    expect(await obtenerZoomAccessToken(creds)).toBe("token-nuevo");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("solicitudes concurrentes rechazadas por el mismo token provocan una sola renovación", async () => {
    const creds = { accountId: "acc-inv-2", clientId: "cli-inv-2", clientSecret: "s" };
    const fetchMock = oauthMock(["token-a", "token-b", "token-c"]);
    vi.stubGlobal("fetch", fetchMock);
    const viejo = await obtenerZoomAccessToken(creds);
    const [x, y, z] = await Promise.all([
      invalidarZoomAccessToken(creds, viejo),
      invalidarZoomAccessToken(creds, viejo),
      invalidarZoomAccessToken(creds, viejo)
    ]);
    expect([x, y, z]).toEqual(["token-b", "token-b", "token-b"]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    // Un rechazo tardío del token viejo reutiliza el ya renovado.
    expect(await invalidarZoomAccessToken(creds, viejo)).toBe("token-b");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("el proveedor expone obtener y renovar", async () => {
    const creds = { accountId: "acc-inv-3", clientId: "cli-inv-3", clientSecret: "s" };
    vi.stubGlobal("fetch", oauthMock(["uno", "dos"]));
    const proveedor = crearProveedorTokenZoom(creds);
    expect(await proveedor.obtener()).toBe("uno");
    expect(await proveedor.renovar("uno")).toBe("dos");
  });
});
