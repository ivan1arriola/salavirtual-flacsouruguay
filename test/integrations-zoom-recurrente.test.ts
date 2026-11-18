import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  actualizarOcurrenciaZoomHttp,
  buscarReunionZoomPorMarcaHttp,
  crearReunionZoomRecurrenteHttp,
  eliminarOcurrenciaZoomHttp
} from "../src/integrations/zoom/zoom-client";

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return {
    ok,
    status,
    statusText: ok ? "OK" : "Error",
    json: async () => cuerpo,
    text: async () => JSON.stringify(cuerpo)
  };
}

describe("reuniones recurrentes de Zoom", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("crearReunionZoomRecurrenteHttp", () => {
    const okConOcurrencias = respuesta({
      id: 123456,
      join_url: "https://flacso.zoom.us/j/123456",
      start_url: "https://flacso.zoom.us/s/123456?zak=x",
      occurrences: [
        { occurrence_id: "occ-1", start_time: "2026-11-10T18:00:00Z", duration: 120, status: "available" },
        { occurrence_id: "occ-2", start_time: "2026-11-17T18:00:00Z", duration: 120, status: "available" }
      ]
    });

    it("crea una reunión recurrente con horario fijo (type 8), fechas y regla de recurrencia", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okConOcurrencias);
      vi.stubGlobal("fetch", fetchMock);

      const fechaInicio = new Date("2026-11-10T18:00:00Z");
      const resultado = await crearReunionZoomRecurrenteHttp("tok", "sala01@flacso.edu.uy", {
        topic: "Seminario",
        startTime: fechaInicio,
        durationMinutes: 120,
        timezone: "America/Montevideo",
        agenda: "[serie:abc]",
        requiereGrabacion: false,
        recurrence: {
          type: 2, // semanal
          repeatInterval: 1,
          weeklyDays: "3", // martes
          endTimes: 2
        }
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.zoom.us/v2/users/sala01%40flacso.edu.uy/meetings");
      expect(init.method).toBe("POST");
      const cuerpo = JSON.parse(init.body);
      expect(cuerpo.type).toBe(8);
      expect(cuerpo.start_time).toBe("2026-11-10T15:00:00"); // 18:00Z = 15:00 en Uruguay
      expect(cuerpo.duration).toBe(120);
      expect(cuerpo.timezone).toBe("America/Montevideo");
      expect(cuerpo.recurrence).toEqual({
        type: 2,
        repeat_interval: 1,
        weekly_days: "3",
        end_times: 2
      });
      expect(cuerpo.topic).toBe("Seminario");
      expect(cuerpo.agenda).toBe("[serie:abc]");
      expect(cuerpo.settings.auto_recording).toBe("none");
      expect(resultado).toMatchObject({
        meetingId: "123456",
        joinUrl: "https://flacso.zoom.us/j/123456",
        occurrences: [
          { occurrenceId: "occ-1", startTime: "2026-11-10T18:00:00Z", duration: 120 },
          { occurrenceId: "occ-2", startTime: "2026-11-17T18:00:00Z", duration: 120 }
        ]
      });
    });

    it("pide grabación en la nube cuando la reunión la requiere", async () => {
      const fetchMock = vi.fn().mockResolvedValue(okConOcurrencias);
      vi.stubGlobal("fetch", fetchMock);
      await crearReunionZoomRecurrenteHttp("tok", "sala01@flacso.edu.uy", {
        topic: "T",
        startTime: new Date("2026-11-10T18:00:00Z"),
        durationMinutes: 60,
        timezone: "America/Montevideo",
        requiereGrabacion: true,
        recurrence: { type: 2, repeatInterval: 1, weeklyDays: "3", endTimes: 1 }
      });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).settings.auto_recording).toBe("cloud");
    });

    it("lanza un error con el estado cuando Zoom rechaza la creación", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ message: "sin licencia" }, false, 400)));
      await expect(
        crearReunionZoomRecurrenteHttp("tok", "x@flacso.edu.uy", {
          topic: "T",
          startTime: new Date("2026-11-10T18:00:00Z"),
          durationMinutes: 60,
          timezone: "America/Montevideo",
          recurrence: { type: 2, repeatInterval: 1, weeklyDays: "3", endTimes: 1 }
        })
      ).rejects.toThrow(/400/);
    });

    it("lanza un error si Zoom no devuelve el enlace de acceso", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ id: 1 })));
      await expect(
        crearReunionZoomRecurrenteHttp("tok", "x@flacso.edu.uy", {
          topic: "T",
          startTime: new Date("2026-11-10T18:00:00Z"),
          durationMinutes: 60,
          timezone: "America/Montevideo",
          recurrence: { type: 2, repeatInterval: 1, weeklyDays: "3", endTimes: 1 }
        })
      ).rejects.toThrow(/enlace/i);
    });
  });

  describe("operaciones sobre ocurrencias individuales", () => {
    it("eliminarOcurrenciaZoomHttp llama a DELETE /meetings/{id}?occurrence_id={occId}", async () => {
      const fetchMock = vi.fn().mockResolvedValue(respuesta({}, true, 204));
      vi.stubGlobal("fetch", fetchMock);

      await eliminarOcurrenciaZoomHttp("tok", "123456", "occ-feriado");

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.zoom.us/v2/meetings/123456?occurrence_id=occ-feriado");
      expect(init.method).toBe("DELETE");
    });

    it("actualizarOcurrenciaZoomHttp llama a PATCH /meetings/{id}?occurrence_id={occId} con nuevo horario", async () => {
      const fetchMock = vi.fn().mockResolvedValue(respuesta({}, true, 204));
      vi.stubGlobal("fetch", fetchMock);

      const nuevaFecha = new Date("2026-11-12T19:00:00Z");
      await actualizarOcurrenciaZoomHttp("tok", "123456", "occ-1", {
        startTime: nuevaFecha,
        durationMinutes: 90
      });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.zoom.us/v2/meetings/123456?occurrence_id=occ-1");
      expect(init.method).toBe("PATCH");
      const cuerpo = JSON.parse(init.body);
      expect(cuerpo.start_time).toBe("2026-11-12T16:00:00"); // 19:00Z = 16:00 en Uruguay
      expect(cuerpo.duration).toBe(90);
    });
  });

  describe("buscarReunionZoomPorMarcaHttp", () => {
    it("recorre las páginas y devuelve la reunión que lleva la marca", async () => {
      const fetchMock = vi
        .fn()
        .mockResolvedValueOnce(
          respuesta({
            meetings: [{ id: 1, join_url: "https://z/1", agenda: "otra" }],
            next_page_token: "pagina-2"
          })
        )
        .mockResolvedValueOnce(
          respuesta({
            meetings: [{ id: 2, join_url: "https://z/2", agenda: "Texto [serie:abc] más texto" }],
            next_page_token: ""
          })
        );
      vi.stubGlobal("fetch", fetchMock);

      const encontrada = await buscarReunionZoomPorMarcaHttp("tok", "sala01@flacso.edu.uy", "[serie:abc]");

      expect(encontrada).toMatchObject({ meetingId: "2", joinUrl: "https://z/2" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain("/users/sala01%40flacso.edu.uy/meetings");
      expect(fetchMock.mock.calls[1][0]).toContain("next_page_token=pagina-2");
    });

    it("devuelve null si ninguna reunión tiene la marca", async () => {
      vi.stubGlobal(
        "fetch",
        vi.fn().mockResolvedValue(respuesta({ meetings: [{ id: 1, join_url: "https://z/1", agenda: "x" }] }))
      );
      await expect(
        buscarReunionZoomPorMarcaHttp("tok", "x@flacso.edu.uy", "[serie:zzz]")
      ).resolves.toBeNull();
    });

    it("no confunde una marca con otra que la contiene como prefijo", async () => {
      vi.stubGlobal(
        "fetch",
        vi
          .fn()
          .mockResolvedValue(
            respuesta({ meetings: [{ id: 1, join_url: "https://z/1", agenda: "[serie:abc123]" }] })
          )
      );
      await expect(
        buscarReunionZoomPorMarcaHttp("tok", "x@flacso.edu.uy", "[serie:abc]")
      ).resolves.toBeNull();
    });

    it("lanza un error cuando Zoom falla al listar", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ message: "no" }, false, 500)));
      await expect(buscarReunionZoomPorMarcaHttp("tok", "x@flacso.edu.uy", "[serie:abc]")).rejects.toThrow(
        /500/
      );
    });
  });
});
