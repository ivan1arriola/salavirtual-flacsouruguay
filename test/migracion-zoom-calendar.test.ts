import { describe, expect, it } from "vitest";
import { prepararCambioEnlaceCalendarZoom, prepararCambioEnlaceZoomACalendar } from "../src/modules/reuniones/migracion-zoom-calendar.domain";

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

describe("prepararCambioEnlaceZoomACalendar", () => {
  const viejo1 = "https://us06web.zoom.us/j/111?pwd=a";
  const viejo2 = "https://us06web.zoom.us/j/222?pwd=b";

  it("quita varios enlaces de Zoom previos de descripción y ubicación y deja uno solo", () => {
    const patch = prepararCambioEnlaceZoomACalendar(
      { description: `Clase\nZoom: ${viejo1}\nOtra vez: ${viejo2}`, location: viejo1 },
      viejo1,
      zoom,
    );
    expect(patch.description.split(zoom)).toHaveLength(2);
    expect(patch.description).not.toContain("111");
    expect(patch.description).not.toContain("222");
    expect(patch.description).toContain("Clase");
    expect(patch.location).toBe(zoom);
  });

  it("conserva otros campos y la sede física, y es repetible", () => {
    const actual = { description: "Aula 4", location: "Sede FLACSO" };
    const primero = prepararCambioEnlaceZoomACalendar(actual, null, zoom);
    expect(primero).toEqual({ conferenceData: null, description: `Aula 4\nAcceso a Zoom: ${zoom}` });
    expect(prepararCambioEnlaceZoomACalendar({ ...actual, ...primero }, zoom, zoom).description).toBe(primero.description);
  });
});
