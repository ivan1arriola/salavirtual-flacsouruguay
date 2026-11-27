import { describe, expect, it } from "vitest";
import {
  construirActividadEncuentroZoom,
  resumirPresenciaObservadaZoom,
} from "../src/modules/reuniones/presentation/actividad-encuentro-zoom";

describe("presencia observada de Zoom", () => {
  it("no cuenta dos veces un ID y no confunde admisión con entrada", () => {
    const fecha = (seg: number) => new Date(seg * 1000);
    const actividad = construirActividadEncuentroZoom([
      { tipo: "meeting.participant_joined", participanteId: "a", ocurridoAt: fecha(4) },
      {
        tipo: "meeting.participant_joined_waiting_room",
        participanteId: "b",
        ocurridoAt: fecha(2),
      },
      { tipo: "meeting.participant_admitted", participanteId: "b", ocurridoAt: fecha(3) },
      { tipo: "meeting.participant_joined", participanteId: "a", ocurridoAt: fecha(5) },
      { tipo: "meeting.participant_joined", ocurridoAt: fecha(6) },
      {
        tipo: "meeting.participant_joined_waiting_room",
        participanteId: "c",
        ocurridoAt: fecha(7),
      },
      { tipo: "meeting.participant_left", participanteId: "a", ocurridoAt: fecha(8) },
    ]);
    expect(resumirPresenciaObservadaZoom(actividad)).toMatchObject({
      identificadores: 3,
      enSala: 0,
      enEspera: 1,
      sinIdentificador: 1,
      ultimoAviso: fecha(8),
    });
  });
});
