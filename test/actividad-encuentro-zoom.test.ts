import { describe, expect, it } from "vitest";
import { construirActividadEncuentroZoom } from "../src/modules/reuniones/presentation/actividad-encuentro-zoom";

const t = (min: number) => new Date(Date.UTC(2026, 10, 13, 10, min));

describe("actividad del encuentro", () => {
  it("ordena por hora real aunque lleguen desordenados y descarta hitos duplicados", () => {
    const r = construirActividadEncuentroZoom([
      { tipo: "meeting.ended", ocurridoAt: t(60) },
      { tipo: "meeting.started", ocurridoAt: t(0) },
      { tipo: "meeting.started", ocurridoAt: t(0) }
    ]);
    expect(r.map((e) => e.tipo)).toEqual(["meeting.started", "meeting.ended"]);
  });

  it("resume entradas consecutivas y separa las que están muy distanciadas", () => {
    const r = construirActividadEncuentroZoom([
      { tipo: "meeting.participant_joined", ocurridoAt: t(1) },
      { tipo: "meeting.participant_joined", ocurridoAt: t(3) },
      { tipo: "meeting.participant_joined", ocurridoAt: t(5) },
      { tipo: "meeting.participant_joined", ocurridoAt: t(40) }
    ]);
    expect(r.map((e) => [e.cantidad, e.etiqueta])).toEqual([
      [3, "3 entradas de participantes"],
      [1, "1 entrada de participante"]
    ]);
  });

  it("un hito intermedio corta la agrupación y un tipo desconocido no se inventa", () => {
    const r = construirActividadEncuentroZoom([
      { tipo: "meeting.participant_joined", ocurridoAt: t(1) },
      { tipo: "recording.started", ocurridoAt: t(2) },
      { tipo: "meeting.participant_joined", ocurridoAt: t(3) },
      { tipo: "meeting.algo_nuevo", ocurridoAt: t(4) }
    ]);
    expect(r).toHaveLength(4);
    expect(r[3]?.etiqueta).toBe("Evento de Zoom: meeting.algo_nuevo");
  });
  it("conserva eventos simultáneos con huellas distintas y detalles", () => {
    const hecho = { tipo: "meeting.sharing_started", ocurridoAt: t(1) };
    const r = construirActividadEncuentroZoom([
      { ...hecho, huella: "a", participanteId: "p1" },
      { ...hecho, huella: "b", participanteId: "p2", detalle: "detalle" },
      { ...hecho, huella: "a", participanteId: "p1" }
    ]);
    expect(r.map((e) => e.participanteId)).toEqual(["p1", "p2"]);
    expect(r[1]?.detalle).toBe("detalle");
  });
});
