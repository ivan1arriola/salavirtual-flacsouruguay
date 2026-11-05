import { afterEach, describe, expect, it, vi } from "vitest";
import { listarParticipantesReunionPasadaZoomHttp } from "@/src/integrations/zoom/zoom-reports.client";

afterEach(() => vi.unstubAllGlobals());

describe("reportes de asistencia Zoom", () => {
  it("recorre páginas y conserva correos cuando Zoom los informa", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({
        participants: [{ id: "p1", name: "Ana", user_email: "ana@example.com", join_time: "2026-11-01T14:00:00Z", leave_time: "2026-11-01T15:00:00Z" }],
        next_page_token: "segunda"
      }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        participants: [{ id: "p2", name: "Invitado", user_email: "", join_time: "2026-11-01T14:10:00Z", leave_time: "2026-11-01T14:30:00Z" }]
      }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const rows = await listarParticipantesReunionPasadaZoomHttp("token", "uuid/instancia");
    expect(rows).toHaveLength(2);
    expect(rows?.[0].email).toBe("ana@example.com");
    expect(rows?.[1].email).toBeNull();
    expect(String(fetchMock.mock.calls[1][0])).toContain("next_page_token=segunda");
    expect(String(fetchMock.mock.calls[0][0])).toContain("uuid%252Finstancia");
  });

  it("distingue reporte no publicado de reporte vacío", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ participants: [] }), { status: 200 })));
    expect(await listarParticipantesReunionPasadaZoomHttp("token", "uuid")).toBeNull();
    expect(await listarParticipantesReunionPasadaZoomHttp("token", "uuid")).toEqual([]);
  });

  it("propaga errores de Zoom sin convertirlos en ausencia", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 503 })));
    await expect(listarParticipantesReunionPasadaZoomHttp("token", "uuid")).rejects.toThrow("503");
  });
});
