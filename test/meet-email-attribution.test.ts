import { describe, expect, it } from "vitest";
import { atribuirCorreosPorHorario } from "../src/modules/archivos/domain/meet-email-attribution.domain";

const ev = (identificador: string, inicio: string, fin: string, tipoIdentificador = "email_address") => ({
  identificador,
  tipoIdentificador,
  inicio,
  fin
});

describe("atribuirCorreosPorHorario", () => {
  it("asigna el correo cuando ingreso y egreso coinciden (Reports trunca a ms)", () => {
    const r = atribuirCorreosPorHorario(
      [{ participanteId: "p1", inicio: "2026-10-20T12:00:39.559199Z", fin: "2026-10-20T14:01:47.348351Z" }],
      [ev("Reyesaleja@gmail.com", "2026-10-20T12:00:40.393Z", "2026-10-20T14:01:47.393Z")]
    );
    expect(r.correoPorParticipante.get("p1")).toBe("reyesaleja@gmail.com");
    expect(r.participantesAmbiguos).toEqual([]);
  });

  it("no usa nombres ni coincidencias fuera de tolerancia", () => {
    const r = atribuirCorreosPorHorario(
      [{ participanteId: "p1", inicio: "2026-10-20T12:00:00Z", fin: "2026-10-20T13:00:00Z" }],
      [ev("a@x.com", "2026-10-20T12:00:03Z", "2026-10-20T13:00:00Z")]
    );
    expect(r.correoPorParticipante.size).toBe(0);
  });

  it("ignora identificadores que no son email_address", () => {
    const r = atribuirCorreosPorHorario(
      [{ participanteId: "p1", inicio: "2026-10-20T12:00:00Z", fin: "2026-10-20T13:00:00Z" }],
      [
        ev("device-1", "2026-10-20T12:00:00Z", "2026-10-20T13:00:00Z", "device"),
        ev("no-es-correo", "2026-10-20T12:00:00Z", "2026-10-20T13:00:00Z")
      ]
    );
    expect(r.correoPorParticipante.size).toBe(0);
  });

  it("descarta empates: candidatos con correos distintos dejan al participante ambiguo", () => {
    const r = atribuirCorreosPorHorario(
      [{ participanteId: "p1", inicio: "2026-10-20T12:00:00Z", fin: "2026-10-20T13:00:00Z" }],
      [
        ev("a@x.com", "2026-10-20T12:00:00.4Z", "2026-10-20T13:00:00Z"),
        ev("b@x.com", "2026-10-20T12:00:00.6Z", "2026-10-20T13:00:00Z")
      ]
    );
    expect(r.correoPorParticipante.size).toBe(0);
    expect(r.participantesAmbiguos).toEqual(["p1"]);
  });

  it("un participante con sesiones que votan por correos distintos queda sin asignar", () => {
    const r = atribuirCorreosPorHorario(
      [
        { participanteId: "p1", inicio: "2026-10-20T12:00:00Z", fin: "2026-10-20T12:30:00Z" },
        { participanteId: "p1", inicio: "2026-10-20T12:40:00Z", fin: "2026-10-20T13:00:00Z" }
      ],
      [
        ev("a@x.com", "2026-10-20T12:00:00Z", "2026-10-20T12:30:00Z"),
        ev("b@x.com", "2026-10-20T12:40:00Z", "2026-10-20T13:00:00Z")
      ]
    );
    expect(r.correoPorParticipante.size).toBe(0);
    expect(r.participantesAmbiguos).toEqual(["p1"]);
  });

  it("basta una sesión con pareja para identificar a quien tiene sesiones sin evento Reports", () => {
    const r = atribuirCorreosPorHorario(
      [
        { participanteId: "p1", inicio: "2026-10-20T12:00:00Z", fin: "2026-10-20T12:30:00Z" },
        { participanteId: "p1", inicio: "2026-10-20T12:40:00Z", fin: "2026-10-20T13:00:00Z" }
      ],
      [ev("a@x.com", "2026-10-20T12:00:00.5Z", "2026-10-20T12:30:00.2Z")]
    );
    expect(r.correoPorParticipante.get("p1")).toBe("a@x.com");
  });
});
