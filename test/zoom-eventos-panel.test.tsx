import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZoomEventosPanel } from "../src/modules/reuniones/presentation/components/zoom-eventos-panel";

describe("panel de actividad Zoom", () => {
  it("muestra la actividad por encuentro y aclara cuando no hay avisos", () => {
    const html = renderToStaticMarkup(
      <ZoomEventosPanel
        encuentros={[
          {
            id: "a",
            fecha: "2026-11-13T12:00:00.000Z",
            eventos: [{ tipo: "meeting.participant_joined", ocurridoAt: "2026-11-13T12:05:00.000Z" }],
            porHorario: true
          },
          { id: "b", fecha: "2026-11-14T12:00:00.000Z", eventos: [] },
          { id: "c", fecha: "2026-11-15T12:00:00.000Z", eventos: [], sinAsociar: true }
        ]}
      />
    );
    expect(html).toContain("Actividad de Zoom");
    expect(html).toContain("Participante se unió");
    expect(html).toContain("Asociados por número de reunión y horario");
    expect(html).toContain("Sin actividad registrada");
    expect(html).toContain("Todavía no se puede asociar actividad");
  });
});
