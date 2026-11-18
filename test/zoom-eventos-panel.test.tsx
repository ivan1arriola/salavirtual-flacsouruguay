import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ZoomActividadEncuentro } from "../src/modules/reuniones/presentation/components/zoom-eventos-panel";

const html = (actividad: Parameters<typeof ZoomActividadEncuentro>[0]["actividad"]) =>
  renderToStaticMarkup(<ZoomActividadEncuentro actividad={actividad} />);

describe("actividad Zoom de un encuentro", () => {
  it("lista los avisos asociados por horario", () => {
    const salida = html({
      eventos: [{ tipo: "meeting.participant_joined", ocurridoAt: "2026-11-13T12:05:00.000Z" }],
      porHorario: true
    });
    expect(salida).toContain("Actividad de Zoom");
    expect(salida).toContain("Participante se unió");
    expect(salida).toContain("Asociados por número de reunión y horario");
  });

  it("aclara cuando no hay avisos o no se pueden asociar", () => {
    expect(html({ eventos: [] })).toContain("Sin actividad registrada");
    expect(html({ eventos: [], sinAsociar: true })).toContain("Todavía no se puede asociar actividad");
  });
});
