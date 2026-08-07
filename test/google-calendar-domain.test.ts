import { describe, expect, it } from "vitest";
import {
  crearCalendarEvent,
  extraerConferenceData,
  extraerMeetProvisionado
} from "../src/modules/meet/google-calendar.domain";

describe("evento Google Calendar puro", () => {
  it("construye una solicitud Meet con identificador idempotente", () => {
    const event = crearCalendarEvent(
      {
        titulo: "Seminario",
        inicio: new Date("2026-08-03T13:00:00.000Z"),
        fin: new Date("2026-08-03T15:00:00.000Z"),
        timezone: "America/Montevideo",
        calendarId: "sala01@flacso.edu.uy"
      },
      "request-1"
    );

    expect(event.conferenceData.createRequest).toEqual({
      requestId: "request-1",
      conferenceSolutionKey: { type: "hangoutsMeet" }
    });
    expect(event.start.timeZone).toBe("America/Montevideo");
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
      cohostEmails: ["docente@flacso.edu.uy", "web@flacso.edu.uy"]
    }, "request-cohosts");

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
      conferenceData
    }, "unused-for-shared-space");

    expect(event.conferenceData).toBe(conferenceData);
    expect(extraerConferenceData({ conferenceData })).toEqual(conferenceData);
    expect(extraerConferenceData({})).toBeUndefined();
  });
});
