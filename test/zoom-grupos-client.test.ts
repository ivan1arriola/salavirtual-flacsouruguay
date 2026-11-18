import { afterEach, describe, expect, it, vi } from "vitest";
import {
  ZoomPermisosError,
  listarGruposZoomHttp,
  listarMiembrosGrupoZoomHttp
} from "../src/integrations/zoom/zoom-grupos-client";

function respuesta(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("cliente de grupos de Zoom", () => {
  it("lista los grupos", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(respuesta(200, { groups: [{ id: "g1", name: "Anfitriones", total_members: 3 }] }));
    vi.stubGlobal("fetch", fetchMock);
    const grupos = await listarGruposZoomHttp("tok");
    expect(grupos).toEqual([{ id: "g1", nombre: "Anfitriones", totalMiembros: 3 }]);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.zoom.us/v2/groups");
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it("pagina los miembros siguiendo next_page_token", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        respuesta(200, {
          members: [{ id: "u1", email: "a@x.uy", first_name: "Ana", last_name: "Paz", type: 2 }],
          next_page_token: "abc"
        })
      )
      .mockResolvedValueOnce(
        respuesta(200, {
          members: [{ id: "u2", email: "b@x.uy", first_name: "", last_name: "", type: 1 }],
          next_page_token: ""
        })
      );
    vi.stubGlobal("fetch", fetchMock);
    const miembros = await listarMiembrosGrupoZoomHttp("tok", "g/1");
    expect(miembros).toHaveLength(2);
    expect(fetchMock.mock.calls[0][0]).toBe("https://api.zoom.us/v2/groups/g%2F1/members?page_size=300");
    expect(fetchMock.mock.calls[1][0]).toBe(
      "https://api.zoom.us/v2/groups/g%2F1/members?page_size=300&next_page_token=abc"
    );
    expect(miembros[0].nombre).toBe("Ana Paz");
    expect(miembros[1].nombre).toBe("b@x.uy");
  });

  it("marca licenciado solo con type 2", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        respuesta(200, {
          members: [
            { id: "1", email: "a@x.uy", type: 2 },
            { id: "2", email: "b@x.uy", type: 1 },
            { id: "3", email: "c@x.uy", type: 3 }
          ]
        })
      )
    );
    const miembros = await listarMiembrosGrupoZoomHttp("tok", "g1");
    expect(miembros.map((m) => m.licenciado)).toEqual([true, false, false]);
  });

  it("403 lanza ZoomPermisosError", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(403, { message: "no" })));
    const error = await listarGruposZoomHttp("tok").catch((e) => e);
    expect(error).toBeInstanceOf(ZoomPermisosError);
    expect(error.message).toBe(
      "Falta permiso en la app de Zoom: group:read:list_groups:admin y group_member:read:list_members:admin."
    );
  });

  it("404 informa que el grupo ya no existe", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(404, { message: "x" })));
    await expect(listarMiembrosGrupoZoomHttp("tok", "g1")).rejects.toThrow("El grupo de Zoom ya no existe.");
  });

  it("otros errores incluyen el estado pero no el cuerpo crudo de Zoom, que se muestra en pantalla", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta(500, { message: "boom interno" })));
    const error = await listarGruposZoomHttp("tok").catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toMatch(/500/);
    expect((error as Error).message).not.toMatch(/boom/);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("limita la espera de cada llamada a Zoom", async () => {
    const fetchMock = vi.fn().mockResolvedValue(respuesta(200, { groups: [] }));
    vi.stubGlobal("fetch", fetchMock);
    await listarGruposZoomHttp("tok");
    expect(fetchMock.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });

  it("corta una paginación infinita", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation(async () => respuesta(200, { members: [], next_page_token: "siempre" }))
    );
    await expect(listarMiembrosGrupoZoomHttp("tok", "g1")).rejects.toThrow(/páginas/);
  });
});
