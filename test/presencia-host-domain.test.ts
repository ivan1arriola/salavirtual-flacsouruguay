import { describe, expect, it } from "vitest";
import {
  debeNotificarHostAusente,
  evaluarPresenciaHost,
  evaluarVentanaVerificacionPresencia,
  extraerEmailsYNombresEsperados
} from "../src/modules/meet/presencia-host.domain";

describe("presencia de host", () => {
  it("considera la ventana configurada alrededor del inicio", () => {
    const inicio = new Date("2026-09-03T18:00:00.000Z");

    expect(evaluarVentanaVerificacionPresencia(inicio, new Date("2026-09-03T17:50:00.000Z"))).toBe(true);
    expect(evaluarVentanaVerificacionPresencia(inicio, new Date("2026-09-03T18:05:00.000Z"))).toBe(true);
    expect(evaluarVentanaVerificacionPresencia(inicio, new Date("2026-09-03T17:49:59.999Z"))).toBe(false);
    expect(evaluarVentanaVerificacionPresencia(inicio, new Date("2026-09-03T18:05:00.001Z"))).toBe(false);
  });

  it("normaliza y deduplica emails y nombres esperados", () => {
    expect(extraerEmailsYNombresEsperados({
      cuentaProveedorEmail: " SALA@FLACSO.EDU.UY ",
      docenteEmail: "docente@flacso.edu.uy",
      creadorEmail: "docente@flacso.edu.uy",
      cohostEmails: ["cohost@flacso.edu.uy", " COHOST@FLACSO.EDU.UY "],
      docenteNombre: " Ana Pérez ",
      creadorNombre: "ANA PÉREZ",
      responsableNombre: "Iván Arriola"
    })).toEqual({
      emails: ["sala@flacso.edu.uy", "docente@flacso.edu.uy", "cohost@flacso.edu.uy"],
      nombres: ["ana pérez", "iván arriola"]
    });
  });

  it("detecta al host por email", () => {
    expect(evaluarPresenciaHost([
      { nombre: "Invitado", email: "invitado@example.com" },
      { nombre: "Ana Pérez", email: "DOCENTE@FLACSO.EDU.UY" }
    ], {
      docenteEmail: "docente@flacso.edu.uy"
    })).toEqual({
      hostConectado: true,
      participanteMatch: "Ana Pérez",
      totalConectados: 2
    });
  });

  it("detecta al host por nombre y devuelve ausencia cuando no hay coincidencias", () => {
    expect(evaluarPresenciaHost([
      { nombre: "Prof. Ana Pérez" }
    ], {
      docenteNombre: "Ana Pérez"
    }).hostConectado).toBe(true);

    expect(evaluarPresenciaHost([], { docenteNombre: "Ana Pérez" })).toEqual({
      hostConectado: false,
      totalConectados: 0
    });

    expect(evaluarPresenciaHost([
      { nombre: "Otra persona", email: "otra@example.com" }
    ], {
      docenteNombre: "Ana Pérez",
      docenteEmail: "ana@example.com"
    })).toEqual({
      hostConectado: false,
      totalConectados: 1
    });
  });

  it("solo notifica una ausencia pendiente dentro de la ventana", () => {
    expect(debeNotificarHostAusente({
      hostConectado: false,
      yaNotificado: false,
      estaEnVentana: true,
      estadoInstancia: "PROGRAMADA"
    })).toBe(true);

    expect(debeNotificarHostAusente({
      hostConectado: true,
      yaNotificado: false,
      estaEnVentana: true,
      estadoInstancia: "PROGRAMADA"
    })).toBe(false);
    expect(debeNotificarHostAusente({
      hostConectado: false,
      yaNotificado: true,
      estaEnVentana: true,
      estadoInstancia: "PROGRAMADA"
    })).toBe(false);
    expect(debeNotificarHostAusente({
      hostConectado: false,
      yaNotificado: false,
      estaEnVentana: false,
      estadoInstancia: "PROGRAMADA"
    })).toBe(false);
    expect(debeNotificarHostAusente({
      hostConectado: false,
      yaNotificado: false,
      estaEnVentana: true,
      estadoInstancia: "FINALIZADA"
    })).toBe(false);
  });
});
