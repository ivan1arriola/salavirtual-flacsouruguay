import { describe, expect, it } from "vitest";
import {
  crearCalendarEvent,
  crearConferenceDataMeet,
  eventoCalendarCoincideConSolicitud,
  extraerConferenceData,
  extraerMeetProvisionado
} from "../src/modules/meet/google-calendar.domain";

describe("evento Google Calendar puro", () => {
  it("no delega a Calendar la creación del Meet", () => {
    const event = crearCalendarEvent({
      titulo: "Seminario",
      inicio: new Date("2026-08-03T13:00:00.000Z"),
      fin: new Date("2026-08-03T15:00:00.000Z"),
      timezone: "America/Montevideo",
      calendarId: "sala01@flacso.edu.uy",
      calendarEventId: "calendar-request-1"
    });

    expect(event).not.toHaveProperty("conferenceData");
    expect(event.start.timeZone).toBe("America/Montevideo");
  });

  it("construye conferenceData para un espacio creado por Meet API", () => {
    const conferenceData = crearConferenceDataMeet(
      "abc-defg-hij",
      "https://meet.google.com/abc-defg-hij"
    );

    expect(conferenceData).toEqual({
      conferenceId: "abc-defg-hij",
      conferenceSolution: {
        key: { type: "hangoutsMeet" },
        name: "Google Meet"
      },
      entryPoints: [{
        entryPointType: "video",
        uri: "https://meet.google.com/abc-defg-hij",
        label: "meet.google.com/abc-defg-hij",
        meetingCode: "abc-defg-hij"
      }]
    });
  });

  it("extrae codigo, enlace e identificador del evento", () => {
    expect(
      extraerMeetProvisionado({
        id: "calendar-event",
        hangoutLink: "https://meet.google.com/abc-defg-hij",
        conferenceData: { conferenceId: "abc-defg-hij" }
      })
    ).toMatchObject({
      externalEventId: "calendar-event",
      codigoReunion: "abc-defg-hij"
    });
  });

  it("espera cuando la conferencia sigue pendiente", () => {
    expect(extraerMeetProvisionado({ id: "calendar-event" })).toBeNull();
  });

  it("agrega los cohosts como invitados del evento Calendar", () => {
    const event = crearCalendarEvent({
      titulo: "Seminario",
      inicio: new Date("2026-08-03T13:00:00.000Z"),
      fin: new Date("2026-08-03T15:00:00.000Z"),
      timezone: "America/Montevideo",
      calendarId: "sala01@flacso.edu.uy",
      calendarEventId: "calendar-cohosts",
      cohostEmails: ["docente@flacso.edu.uy", "web@flacso.edu.uy"]
    });

    expect(event.attendees).toEqual([
      { email: "docente@flacso.edu.uy" },
      { email: "web@flacso.edu.uy" }
    ]);
  });

  it("reutiliza la conferencia de la serie en un evento Calendar independiente", () => {
    const conferenceData = {
      conferenceId: "abc-defg-hij",
      conferenceSolution: { key: { type: "hangoutsMeet" } },
      entryPoints: [{ entryPointType: "video", uri: "https://meet.google.com/abc-defg-hij" }]
    };
    const event = crearCalendarEvent({
      titulo: "Encuentro 2",
      inicio: new Date("2026-08-10T13:00:00.000Z"),
      fin: new Date("2026-08-10T15:00:00.000Z"),
      timezone: "America/Montevideo",
      calendarId: "sala01@flacso.edu.uy",
      calendarEventId: "calendar-shared",
      conferenceData
    });

    expect(event.conferenceData).toBe(conferenceData);
    expect(extraerConferenceData({ conferenceData })).toEqual(conferenceData);
    expect(extraerConferenceData({})).toBeUndefined();
  });

  it("verifica que Calendar refleje exactamente la reprogramación local", () => {
    const request = {
      titulo: "Clase", descripcion: "Tema", inicio: new Date("2026-08-20T16:00:00Z"),
      fin: new Date("2026-08-20T17:00:00Z"), timezone: "America/Montevideo",
    };
    expect(eventoCalendarCoincideConSolicitud({
      summary: "Clase", description: "Tema",
      start: { dateTime: "2026-08-20T16:00:00Z", timeZone: "America/Montevideo" },
      end: { dateTime: "2026-08-20T17:00:00Z", timeZone: "America/Montevideo" },
    }, request)).toBe(true);
    expect(eventoCalendarCoincideConSolicitud({
      summary: "Clase", description: "Tema",
      start: { dateTime: "2026-08-20T14:00:00Z", timeZone: "America/Montevideo" },
      end: { dateTime: "2026-08-20T15:00:00Z", timeZone: "America/Montevideo" },
    }, request)).toBe(false);
  });
});
