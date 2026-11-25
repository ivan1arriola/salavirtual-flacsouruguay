import { describe, expect, it } from "vitest";
import { CATALOGO_EVENTOS_ZOOM } from "../src/integrations/zoom/zoom-eventos-catalogo";

describe("catálogo de la suscripción Sala Virtual", () => {
  it("contiene los 66 identificadores documentados por Zoom sin repetir", () => {
    const ids = CATALOGO_EVENTOS_ZOOM.map((evento) => evento.tipo);
    expect(ids).toHaveLength(66);
    expect(new Set(ids).size).toBe(66);
    expect(ids.filter((id) => id.startsWith("meeting."))).toHaveLength(40);
    expect(ids.filter((id) => id.startsWith("recording."))).toHaveLength(17);
    expect(ids.filter((id) => id.startsWith("group."))).toHaveLength(9);
    expect(ids).toEqual(
      expect.arrayContaining([
        "meeting.ai_companion_assets_deleted",
        "recording.batch_trashed",
        "group.member_added"
      ])
    );
  });
});
