import { describe, expect, it } from "vitest";
import { prepararCambioEnlaceCalendarZoom } from "../src/modules/reuniones/migracion-zoom-calendar.domain";

const meet = "https://meet.google.com/abc-defg-hij";
const zoom = "https://us06web.zoom.us/j/123?pwd=xyz";

describe("prepararCambioEnlaceCalendarZoom", () => {
  it("quita la conferencia Meet y reemplaza sus enlaces sin alterar la cita", () => {
    const patch = prepararCambioEnlaceCalendarZoom({
      summary: "Clase",
      description: `Material del curso\nAcceso: ${meet}`,
      location: meet,
      conferenceData: { conferenceId: "abc-defg-hij" },
    }, meet, zoom);

    expect(patch).toEqual({
      conferenceData: null,
      description: `Material del curso\nAcceso: ${zoom}`,
      location: zoom,
    });
  });

  it("conserva la sede física y añade Zoom una sola vez al reintentar", () => {
    const current = { description: "Aula 4", location: "Sede FLACSO" };
    const first = prepararCambioEnlaceCalendarZoom(current, meet, zoom);
    const second = prepararCambioEnlaceCalendarZoom({ ...current, ...first }, meet, zoom);

    expect(first).toEqual({ conferenceData: null, description: `Aula 4\nAcceso a Zoom: ${zoom}` });
    expect(second.description).toBe(first.description);
  });
});
