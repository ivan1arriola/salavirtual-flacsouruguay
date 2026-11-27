import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listarProximasReunionesCuentaZoom,
  obtenerDetalleReunionPasadaZoom,
} from "../src/integrations/zoom/zoom-operations.client";

afterEach(() => vi.unstubAllGlobals());

describe("consultas administrativas de Zoom", () => {
  it("recorre todas las páginas de la agenda, sin reducir un error a cero reuniones", async () => {
    const fetchZoom = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            meetings: [{ id: 123456789, start_time: "2026-11-14T13:00:00Z" }],
            next_page_token: "siguiente",
          }),
          { status: 200 },
        ),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ meetings: [{ id: 987654321 }], next_page_token: "" }), {
          status: 200,
        }),
      );
    vi.stubGlobal("fetch", fetchZoom);
    expect(
      (await listarProximasReunionesCuentaZoom("token", "sala@example.org")).map(
        ({ meetingId }) => meetingId,
      ),
    ).toEqual(["123456789", "987654321"]);
    expect(fetchZoom.mock.calls[1][0].toString()).toContain("next_page_token=siguiente");
    fetchZoom.mockResolvedValueOnce(new Response(JSON.stringify({ code: 4711 }), { status: 400 }));
    await expect(listarProximasReunionesCuentaZoom("token", "sala@example.org")).rejects.toThrow();
  });

  it("consulta la ocurrencia por UUID y utiliza la duración informada por Zoom", async () => {
    const fetchZoom = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          start_time: "2026-11-14T13:00:00Z",
          end_time: "2026-11-14T14:00:00Z",
          duration: 55,
          participants_count: 25,
        }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchZoom);
    expect(await obtenerDetalleReunionPasadaZoom("token", "/abc//123")).toMatchObject({
      duracionMinutos: 60,
      participantesReportados: 25,
    });
    expect(fetchZoom.mock.calls[0][0]).toContain("%252Fabc%252F%252F123");
  });
});
