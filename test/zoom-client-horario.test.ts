import { afterEach, describe, expect, it, vi } from "vitest";
import {
  actualizarOcurrenciaZoomHttp,
  actualizarReunionZoomHttp,
  crearReunionZoomHttp,
  crearReunionZoomRecurrenteHttp,
  inicioLocalZoom
} from "../src/integrations/zoom/zoom-client";

// 21:00 UTC = 18:00 en Uruguay (UTC-3, sin horario de verano).
const INICIO = new Date("2026-11-17T21:00:00.000Z");

function responder(cuerpo: unknown) {
  const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify(cuerpo), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}
const cuerpoEnviado = (fetchMock: ReturnType<typeof vi.fn>) =>
  JSON.parse(fetchMock.mock.calls[0]![1].body as string) as Record<string, unknown>;

afterEach(() => vi.unstubAllGlobals());

describe("horario enviado a Zoom", () => {
  it("convierte a hora local de la zona, sin Z ni milisegundos", () => {
    expect(inicioLocalZoom(INICIO, "America/Montevideo")).toBe("2026-11-17T18:00:00");
    expect(inicioLocalZoom(new Date("2026-11-18T00:00:00.000Z"), "America/Montevideo")).toBe(
      "2026-11-17T21:00:00"
    );
  });

  it("crea la reunión con hora local y su zona", async () => {
    const fetchMock = responder({ id: 1, join_url: "https://zoom.us/j/1" });
    await crearReunionZoomHttp("t", "a@b.c", {
      topic: "Clase",
      startTime: INICIO,
      durationMinutes: 120,
      timezone: "America/Montevideo"
    });
    expect(cuerpoEnviado(fetchMock)).toMatchObject({
      start_time: "2026-11-17T18:00:00",
      timezone: "America/Montevideo"
    });
  });

  it("crea la recurrente con hora local y su zona", async () => {
    const fetchMock = responder({ id: 1, join_url: "https://zoom.us/j/1" });
    await crearReunionZoomRecurrenteHttp("t", "a@b.c", {
      topic: "Serie",
      startTime: INICIO,
      durationMinutes: 120,
      timezone: "America/Montevideo",
      recurrence: { type: 2, repeatInterval: 1, weeklyDays: "3", endTimes: 3 }
    });
    expect(cuerpoEnviado(fetchMock)).toMatchObject({
      type: 8,
      start_time: "2026-11-17T18:00:00",
      timezone: "America/Montevideo"
    });
  });

  it("al reprogramar o ajustar una ocurrencia manda siempre la zona", async () => {
    const reprogramar = responder({});
    await actualizarReunionZoomHttp("t", "1", { startTime: INICIO });
    expect(cuerpoEnviado(reprogramar)).toMatchObject({
      start_time: "2026-11-17T18:00:00",
      timezone: "America/Montevideo"
    });

    const ocurrencia = responder({});
    await actualizarOcurrenciaZoomHttp("t", "1", "occ", { startTime: INICIO, durationMinutes: 90 });
    expect(cuerpoEnviado(ocurrencia)).toMatchObject({
      start_time: "2026-11-17T18:00:00",
      timezone: "America/Montevideo",
      duration: 90
    });
  });
});
