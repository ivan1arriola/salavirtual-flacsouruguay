import { afterEach, describe, expect, it, vi } from "vitest";
import { obtenerParticipantesZoomEnVivoHttp } from "@/src/integrations/zoom/zoom-live-participants.client";

afterEach(() => vi.unstubAllGlobals());

describe("participantes Zoom en vivo", () => {
  it("obtiene participantes paginados con correos opcionales", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            participants: [
              { id: "1", user_name: "Ana", email: "ana@example.com", join_time: "2026-11-05T14:00:00Z" }
            ],
            next_page_token: "page2"
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            participants: [{ id: "2", user_name: "Invitado" }]
          }),
          { status: 200 }
        )
      );
    vi.stubGlobal("fetch", fetchMock);
    const result = await obtenerParticipantesZoomEnVivoHttp("token", "123");
    expect(result.estado).toBe("DISPONIBLE");
    if (result.estado !== "DISPONIBLE") {
      throw new Error("resultado inesperado");
    }
    expect(result.participantes).toHaveLength(2);
    expect(result.participantes[0].email).toBe("ana@example.com");
    expect(result.participantes[1].email).toBeNull();
    expect(String(fetchMock.mock.calls[1][0])).toContain("next_page_token=page2");
  });

  it("no confunde falta de permisos con cero participantes", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 403 })));
    expect(await obtenerParticipantesZoomEnVivoHttp("token", "123")).toEqual({
      estado: "NO_DISPONIBLE",
      motivo: "SIN_PERMISOS",
      httpStatus: 403
    });
  });

  it("conserva el código HTTP de fallos transitorios", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 500 })));
    expect(await obtenerParticipantesZoomEnVivoHttp("token", "123")).toEqual({
      estado: "NO_DISPONIBLE",
      motivo: "ERROR_API",
      httpStatus: 500
    });
  });
});
