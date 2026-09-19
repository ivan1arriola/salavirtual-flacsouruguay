import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import {
  actualizarEventoCalendarHttp,
  calendarEventsUrl,
  calendarEventUrl,
  crearEventoCalendarHttp,
  eliminarEventoCalendarHttp,
  isAlreadyCalendarEventError,
  isCalendarNotFoundError,
  obtenerEventoCalendar,
  obtenerEventoCalendarSiExiste,
  type GoogleCalendarEvent,
} from "../src/integrations/google/calendar";

describe("integrations/google/calendar", () => {
  const calendarId = "sala01@flacso.edu.uy";
  const eventId = "flacso-event-123";

  it("construye URLs de eventos y colecciones correctamente codificadas", () => {
    expect(calendarEventsUrl(calendarId)).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/sala01%40flacso.edu.uy/events"
    );
    expect(calendarEventUrl(calendarId, eventId)).toBe(
      "https://www.googleapis.com/calendar/v3/calendars/sala01%40flacso.edu.uy/events/flacso-event-123"
    );
  });

  it("obtenerEventoCalendar realiza GET con conferenceDataVersion cuando se especifica", async () => {
    const mockData: GoogleCalendarEvent = { id: eventId, summary: "Clase Magistral" };
    const auth = {
      request: vi.fn().mockResolvedValue({ data: mockData }),
    } as unknown as JWT;

    const result = await obtenerEventoCalendar(auth, calendarId, eventId, { conferenceDataVersion: 1 });
    expect(result).toEqual(mockData);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        url: expect.stringContaining("conferenceDataVersion=1"),
        method: "GET",
      })
    );
  });

  it("obtenerEventoCalendarSiExiste devuelve null si la API responde 404", async () => {
    const notFoundError = new Error("Not Found");
    (notFoundError as { code?: number }).code = 404;

    const auth = {
      request: vi.fn().mockRejectedValue(notFoundError),
    } as unknown as JWT;

    const result = await obtenerEventoCalendarSiExiste(auth, calendarId, eventId);
    expect(result).toBeNull();
  });

  it("obtenerEventoCalendarSiExiste relanza errores distintos a 404", async () => {
    const serverError = new Error("Internal Server Error");
    (serverError as { code?: number }).code = 500;

    const auth = {
      request: vi.fn().mockRejectedValue(serverError),
    } as unknown as JWT;

    await expect(obtenerEventoCalendarSiExiste(auth, calendarId, eventId)).rejects.toThrow("Internal Server Error");
  });

  it("crearEventoCalendarHttp realiza POST con sendUpdates y datos del evento", async () => {
    const newEvent: GoogleCalendarEvent = { id: eventId, summary: "Nueva Reunión" };
    const auth = {
      request: vi.fn().mockResolvedValue({ data: newEvent }),
    } as unknown as JWT;

    const result = await crearEventoCalendarHttp(auth, calendarId, newEvent, {
      conferenceDataVersion: 1,
      sendUpdates: "all",
    });

    expect(result).toEqual(newEvent);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "POST",
        url: expect.stringContaining("sendUpdates=all"),
        data: newEvent,
      })
    );
  });

  it("actualizarEventoCalendarHttp realiza PATCH con patchData", async () => {
    const patched: GoogleCalendarEvent = { id: eventId, summary: "Reunión Actualizada" };
    const auth = {
      request: vi.fn().mockResolvedValue({ data: patched }),
    } as unknown as JWT;

    const result = await actualizarEventoCalendarHttp(
      auth,
      calendarId,
      eventId,
      { summary: "Reunión Actualizada" },
      { sendUpdates: "none" }
    );

    expect(result).toEqual(patched);
    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        url: expect.stringContaining("sendUpdates=none"),
        data: { summary: "Reunión Actualizada" },
      })
    );
  });

  it("eliminarEventoCalendarHttp realiza DELETE con sendUpdates", async () => {
    const auth = {
      request: vi.fn().mockResolvedValue({ data: {} }),
    } as unknown as JWT;

    await eliminarEventoCalendarHttp(auth, calendarId, eventId, { sendUpdates: "none" });

    expect(auth.request).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "DELETE",
        url: expect.stringContaining("sendUpdates=none"),
      })
    );
  });

  describe("utilidades de error", () => {
    it("isAlreadyCalendarEventError detecta 409 y ALREADY_EXISTS", () => {
      expect(isAlreadyCalendarEventError({ code: 409 })).toBe(true);
      expect(isAlreadyCalendarEventError({ response: { status: 409 } })).toBe(true);
      expect(isAlreadyCalendarEventError({ response: { data: { error: "ALREADY_EXISTS" } } })).toBe(true);
      expect(isAlreadyCalendarEventError({ code: 404 })).toBe(false);
      expect(isAlreadyCalendarEventError(null)).toBe(false);
    });

    it("isCalendarNotFoundError detecta 404 en code y status", () => {
      expect(isCalendarNotFoundError({ code: 404 })).toBe(true);
      expect(isCalendarNotFoundError({ response: { status: 404 } })).toBe(true);
      expect(isCalendarNotFoundError({ code: 500 })).toBe(false);
      expect(isCalendarNotFoundError(undefined)).toBe(false);
    });
  });
});

