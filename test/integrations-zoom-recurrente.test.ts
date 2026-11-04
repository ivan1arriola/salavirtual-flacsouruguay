import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  buscarReunionZoomPorMarcaHttp,
  crearReunionZoomRecurrenteHttp
} from "../src/integrations/zoom/zoom-client";

function respuesta(cuerpo: unknown, ok = true, status = 200) {
  return { ok, status, statusText: ok ? "OK" : "Error", json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) };
}

describe("reuniones recurrentes de Zoom", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("crearReunionZoomRecurrenteHttp", () => {
    const ok = respuesta({ id: 123456, join_url: "https://flacso.zoom.us/j/123456", start_url: "https://flacso.zoom.us/s/123456?zak=x" });

    it("crea una reunión recurrente sin horario fijo y con la marca de la serie en la agenda", async () => {
      const fetchMock = vi.fn().mockResolvedValue(ok);
      vi.stubGlobal("fetch", fetchMock);

      const resultado = await crearReunionZoomRecurrenteHttp("tok", "sala01@flacso.edu.uy", {
        topic: "Seminario",
        agenda: "[serie:abc]",
        requiereGrabacion: false
      });

      const [url, init] = fetchMock.mock.calls[0];
      expect(url).toBe("https://api.zoom.us/v2/users/sala01%40flacso.edu.uy/meetings");
      expect(init.method).toBe("POST");
      const cuerpo = JSON.parse(init.body);
      expect(cuerpo.type).toBe(3);
      expect(cuerpo).not.toHaveProperty("start_time");
      expect(cuerpo).not.toHaveProperty("recurrence");
      expect(cuerpo.topic).toBe("Seminario");
      expect(cuerpo.agenda).toBe("[serie:abc]");
      expect(cuerpo.settings.auto_recording).toBe("none");
      expect(resultado).toMatchObject({ meetingId: "123456", joinUrl: "https://flacso.zoom.us/j/123456" });
    });

    it("pide grabación en la nube cuando la reunión la requiere", async () => {
      const fetchMock = vi.fn().mockResolvedValue(ok);
      vi.stubGlobal("fetch", fetchMock);
      await crearReunionZoomRecurrenteHttp("tok", "sala01@flacso.edu.uy", { topic: "T", requiereGrabacion: true });
      expect(JSON.parse(fetchMock.mock.calls[0][1].body).settings.auto_recording).toBe("cloud");
    });

    it("lanza un error con el estado cuando Zoom rechaza la creación", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ message: "sin licencia" }, false, 400)));
      await expect(crearReunionZoomRecurrenteHttp("tok", "x@flacso.edu.uy", { topic: "T" })).rejects.toThrow(/400/);
    });

    it("lanza un error si Zoom no devuelve el enlace de acceso", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ id: 1 })));
      await expect(crearReunionZoomRecurrenteHttp("tok", "x@flacso.edu.uy", { topic: "T" })).rejects.toThrow(/enlace/i);
    });
  });

  describe("buscarReunionZoomPorMarcaHttp", () => {
    it("recorre las páginas y devuelve la reunión que lleva la marca", async () => {
      const fetchMock = vi.fn()
        .mockResolvedValueOnce(respuesta({
          meetings: [{ id: 1, join_url: "https://z/1", agenda: "otra" }],
          next_page_token: "pagina-2"
        }))
        .mockResolvedValueOnce(respuesta({
          meetings: [{ id: 2, join_url: "https://z/2", agenda: "Texto [serie:abc] más texto" }],
          next_page_token: ""
        }));
      vi.stubGlobal("fetch", fetchMock);

      const encontrada = await buscarReunionZoomPorMarcaHttp("tok", "sala01@flacso.edu.uy", "[serie:abc]");

      expect(encontrada).toMatchObject({ meetingId: "2", joinUrl: "https://z/2" });
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock.mock.calls[0][0]).toContain("/users/sala01%40flacso.edu.uy/meetings");
      expect(fetchMock.mock.calls[1][0]).toContain("next_page_token=pagina-2");
    });

    it("devuelve null si ninguna reunión tiene la marca", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ meetings: [{ id: 1, join_url: "https://z/1", agenda: "x" }] })));
      await expect(buscarReunionZoomPorMarcaHttp("tok", "x@flacso.edu.uy", "[serie:zzz]")).resolves.toBeNull();
    });

    it("no confunde una marca con otra que la contiene como prefijo", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ meetings: [{ id: 1, join_url: "https://z/1", agenda: "[serie:abc123]" }] })));
      await expect(buscarReunionZoomPorMarcaHttp("tok", "x@flacso.edu.uy", "[serie:abc]")).resolves.toBeNull();
    });

    it("lanza un error cuando Zoom falla al listar", async () => {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta({ message: "no" }, false, 500)));
      await expect(buscarReunionZoomPorMarcaHttp("tok", "x@flacso.edu.uy", "[serie:abc]")).rejects.toThrow(/500/);
    });
  });
});
