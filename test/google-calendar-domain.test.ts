import { describe, expect, it } from "vitest";
import {
  crearCalendarEvent,
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
});
