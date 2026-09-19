import { describe, expect, it } from "vitest";
import {
  cohostAccountGuidance,
  cohostsConfirmados,
  crearCalendarEvent,
  crearConferenceDataMeet,
  detalleCohostsVerificados,
  esErrorNoBloqueanteDeScopesMeet,
  estadoIntegracionEfectivo,
  eventoCalendarCoincideConSolicitud,
  extraerConferenceData,
  extraerMeetProvisionado,
  invalidarVerificacionCohosts,
  meetLinks,
  normalizeCohostEmails,
  normalizeMeetLink,
  registrarVerificacionCohosts,
  requiereAtencionIntegracionMeet,
  type ConferenceProvisionRequest,
} from "../src/modules/conferencias/domain";

describe("conferencias/domain", () => {
  describe("cohosts.domain", () => {
    it("normaliza correos y elimina duplicados y espacios", () => {
      const emails = [" Docente@Flacso.edu.uy ", "docente@flacso.edu.uy", "asistente@flacso.edu.uy"];
      expect(normalizeCohostEmails(emails)).toEqual([
        "docente@flacso.edu.uy",
        "asistente@flacso.edu.uy",
      ]);
    });

    it("provee guia de cuentas segun el dominio de los correos", () => {
      expect(cohostAccountGuidance([])).toBe("");
      expect(cohostAccountGuidance(["doc@flacso.edu.uy"])).toBe("ingresar con cuenta FLACSO");
      expect(cohostAccountGuidance(["doc@gmail.com"])).toBe("ingresar con cuenta Google");
    });
  });

  describe("cohost-verification.domain", () => {
    it("registra, invalida y evalua verificacion de cohosts inmutablemente", () => {
      const payload = { previousData: 123 };
      const verified = registrarVerificacionCohosts(
        payload,
        "abc-defg-hij",
        "sala01@flacso.edu.uy",
        ["docente@flacso.edu.uy", "sala01@flacso.edu.uy"],
        "2026-09-19T15:00:00.000Z"
      );

      expect(cohostsConfirmados(verified, "abc-defg-hij", "sala01@flacso.edu.uy", ["docente@flacso.edu.uy"])).toBe(true);
      expect(cohostsConfirmados(verified, "otro-codigo", "sala01@flacso.edu.uy", ["docente@flacso.edu.uy"])).toBe(false);

      const detalle = detalleCohostsVerificados(verified, "abc-defg-hij", "sala01@flacso.edu.uy", [
        "docente@flacso.edu.uy",
        "otro@flacso.edu.uy",
      ]);
      expect(detalle.confirmados).toBe(false);
      expect(detalle.emailsConfirmados).toEqual(["docente@flacso.edu.uy"]);
      expect(detalle.emailsPendientes).toEqual(["otro@flacso.edu.uy"]);

      const invalidated = invalidarVerificacionCohosts(verified);
      expect(cohostsConfirmados(invalidated, "abc-defg-hij", "sala01@flacso.edu.uy", ["docente@flacso.edu.uy"])).toBe(false);
    });
  });

  describe("conferencia-health.domain", () => {
    it("clasifica errores no bloqueantes de scopes como sincronizadas si ya existe link", () => {
      const healthConErrorScopes = {
        estadoIntegracion: "ERROR" as const,
        joinUrl: "https://meet.google.com/abc-defg-hij",
        errorIntegracion: "403: Insufficient authentication scopes for spaces.members",
      };
      expect(esErrorNoBloqueanteDeScopesMeet(healthConErrorScopes)).toBe(true);
      expect(estadoIntegracionEfectivo(healthConErrorScopes)).toBe("SINCRONIZADA");
    });

    it("requiere atencion si el error es bloqueante o no tiene meet", () => {
      const healthSinMeet = {
        estadoIntegracion: "ERROR" as const,
        errorIntegracion: "Network timeout",
      };
      expect(esErrorNoBloqueanteDeScopesMeet(healthSinMeet)).toBe(false);
      expect(requiereAtencionIntegracionMeet(healthSinMeet)).toBe(true);
      expect(estadoIntegracionEfectivo(healthSinMeet)).toBe("ERROR");
    });
  });

  describe("meet-link.domain", () => {
    it("extrae y normaliza URLs y codigos de Google Meet", () => {
      expect(normalizeMeetLink("abc-defg-hij")).toEqual({
        code: "abc-defg-hij",
        url: "https://meet.google.com/abc-defg-hij",
      });
      expect(normalizeMeetLink("https://meet.google.com/abc-defg-hij?authuser=1")).toEqual({
        code: "abc-defg-hij",
        url: "https://meet.google.com/abc-defg-hij",
      });
      expect(normalizeMeetLink("https://zoom.us/j/123456")).toBeNull();

      const links = meetLinks("abc-defg-hij", "https://meet.google.com/abc-defg-hij");
      expect(links).toHaveLength(1);
      expect(links[0].code).toBe("abc-defg-hij");
    });
  });

  describe("calendar-event.domain", () => {
    const request: ConferenceProvisionRequest = {
      titulo: "Reunión de Posgrado",
      descripcion: "Clase 1",
      inicio: new Date("2026-10-01T14:00:00.000Z"),
      fin: new Date("2026-10-01T16:00:00.000Z"),
      timezone: "America/Montevideo",
      calendarId: "sala01@flacso.edu.uy",
      calendarEventId: "evt-posgrado-01",
      cohostEmails: ["docente@flacso.edu.uy"],
      guestEmails: ["alumno@flacso.edu.uy"],
    };

    it("crearCalendarEvent genera payload con attendees unificados y formato ISO", () => {
      const event = crearCalendarEvent(request);
      expect(event.id).toBe("evt-posgrado-01");
      expect(event.summary).toBe("Reunión de Posgrado");
      expect(event.attendees).toEqual([
        { email: "docente@flacso.edu.uy" },
        { email: "alumno@flacso.edu.uy" },
      ]);
    });

    it("crearConferenceDataMeet genera conferenceSolution hangoutsMeet", () => {
      const confData = crearConferenceDataMeet("abc-defg-hij", "https://meet.google.com/abc-defg-hij");
      expect(confData.conferenceId).toBe("abc-defg-hij");
      expect(confData.conferenceSolution.key.type).toBe("hangoutsMeet");
      expect(confData.entryPoints[0].uri).toBe("https://meet.google.com/abc-defg-hij");
    });

    it("extraerConferenceData obtiene conferenceData del objeto payload", () => {
      expect(extraerConferenceData(null)).toBeUndefined();
      expect(extraerConferenceData({ conferenceData: { conferenceId: "xyz" } })).toEqual({
        conferenceId: "xyz",
      });
    });

    it("extraerMeetProvisionado extrae datos del evento calendar", () => {
      const provisioned = extraerMeetProvisionado({
        id: "evt-1",
        hangoutLink: "https://meet.google.com/abc-defg-hij",
        conferenceData: { conferenceId: "abc-defg-hij" },
      });
      expect(provisioned).toEqual({
        externalEventId: "evt-1",
        codigoReunion: "abc-defg-hij",
        joinUrl: "https://meet.google.com/abc-defg-hij",
        payload: expect.any(Object),
      });
    });

    it("eventoCalendarCoincideConSolicitud valida coincidencia estricta de tiempos y titulo", () => {
      const payload = {
        summary: request.titulo,
        description: request.descripcion,
        start: { dateTime: request.inicio.toISOString(), timeZone: request.timezone },
        end: { dateTime: request.fin.toISOString(), timeZone: request.timezone },
      };
      expect(eventoCalendarCoincideConSolicitud(payload, request)).toBe(true);

      const modified = { ...payload, summary: "Otro titulo" };
      expect(eventoCalendarCoincideConSolicitud(modified, request)).toBe(false);
    });
  });
});

