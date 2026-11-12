import { afterEach, describe, expect, it, vi } from "vitest";
import { resolverUuidInstanciaZoomHttp } from "@/src/integrations/zoom/zoom-instances.client";

afterEach(() => vi.unstubAllGlobals());

describe("identificación de instancias Zoom", () => {
  const inicio = new Date("2026-11-05T14:00:00Z");
  const fin = new Date("2026-11-05T16:00:00Z");

  it("elige solo la ocurrencia en la ventana de la clase", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            meetings: [
              { uuid: "otra-clase", start_time: "2026-11-04T14:00:00Z" },
              { uuid: "clase-correcta", start_time: "2026-11-05T14:05:00Z" }
            ]
          }),
          { status: 200 }
        )
      )
    );
    expect(await resolverUuidInstanciaZoomHttp("token", "123", inicio, fin)).toBe("clase-correcta");
  });

  it("no mezcla clases si existen dos ocurrencias candidatas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            meetings: [
              { uuid: "primera", start_time: "2026-11-05T14:05:00Z" },
              { uuid: "segunda", start_time: "2026-11-05T15:00:00Z" }
            ]
          }),
          { status: 200 }
        )
      )
    );
    expect(await resolverUuidInstanciaZoomHttp("token", "123", inicio, fin)).toBeNull();
  });
  it("no selecciona una ocurrencia fuera del horario, aunque comparta ID", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            meetings: [{ uuid: "otra-fecha", start_time: "2026-11-06T14:00:00Z" }]
          }),
          { status: 200 }
        )
      )
    );
    expect(await resolverUuidInstanciaZoomHttp("token", "123", inicio, fin)).toBeNull();
  });

  it("no identifica sesiones si Zoom no dispone de instancias", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("", { status: 404 })));
    expect(await resolverUuidInstanciaZoomHttp("token", "123", inicio, fin)).toBeNull();
  });

  it("rechaza fechas programadas inválidas", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await resolverUuidInstanciaZoomHttp("token", "123", fin, inicio)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
