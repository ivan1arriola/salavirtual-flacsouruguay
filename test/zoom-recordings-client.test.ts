import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  listarGrabacionesAnfitrionZoomHttp,
  obtenerInventarioOcurrenciaZoomHttp,
  obtenerResumenReunionZoomHttp,
} from "@/src/integrations/zoom/zoom-recordings.client";
import { ZoomApiError } from "@/src/integrations/zoom/zoom-http";
import { crearProveedorTokenZoom } from "@/src/integrations/zoom/zoom-client";
import { normalizarInventarioZoom } from "@/src/modules/archivos/domain/zoom-archivos.domain";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const fixture = (nombre: string) => readFileSync(`test/fixtures/zoom/${nombre}.json`, "utf8");
const json = (texto: string, status = 200, headers?: Record<string, string>) =>
  new Response(texto, { status, headers });
const ventana = { cuentaZoomId: "cuenta-1", desde: "2026-11-03", hasta: "2026-11-30" } as const;
const sha = (t: string) => createHash("sha256").update(t).digest("hex");

async function errorDe(promesa: Promise<unknown>): Promise<ZoomApiError> {
  try {
    await promesa;
  } catch (e) {
    expect(e).toBeInstanceOf(ZoomApiError);
    return e as ZoomApiError;
  }
  throw new Error("se esperaba un error");
}

describe("listado de grabaciones por anfitrión", () => {
  it("recorre dos páginas, expande la ventana ±1 día UTC y filtra por fecha de Montevideo", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(json(fixture("recordings-pagina-1")))
      .mockResolvedValueOnce(json(fixture("recordings-pagina-2")));
    vi.stubGlobal("fetch", fetchMock);

    const p1 = await listarGrabacionesAnfitrionZoomHttp("tok", "host@example.com", ventana, null);
    expect(p1.siguiente).toBe("TOKEN_PAGINA_2");
    expect(p1.elementos).toHaveLength(1);
    expect(p1.elementos[0]).toMatchObject({
      cuentaZoomId: "cuenta-1",
      uuid: "AbCdEf1234567890+/==",
      meetingId: "81234567890",
      anfitrionZoomId: "HOST_SANEADO_1",
      titulo: "Seminario de Políticas Públicas",
    });
    expect(p1.elementos[0].inicioRealAt.toISOString()).toBe("2026-11-05T14:02:11.000Z");

    const p2 = await listarGrabacionesAnfitrionZoomHttp(
      "tok",
      "host@example.com",
      ventana,
      p1.siguiente,
    );
    expect(p2.siguiente).toBeNull();
    // Mismo meetingId reutilizado: se distinguen por UUID. La reunión del 31/10 20:30 Montevideo queda
    // fuera; la del 30/11 22:30 Montevideo (01:30 UTC del 1/12) queda dentro.
    expect(p2.elementos.map((e) => e.uuid)).toEqual(["ZzYyXx0987654321==", "BordeMontevideo=="]);

    const url1 = new URL(String(fetchMock.mock.calls[0][0]));
    expect(decodeURIComponent(url1.pathname)).toBe("/v2/users/host@example.com/recordings");
    expect(url1.searchParams.get("from")).toBe("2026-11-02");
    expect(url1.searchParams.get("to")).toBe("2026-12-01");
    expect(url1.searchParams.get("trash")).toBeNull();
    expect(url1.searchParams.get("next_page_token")).toBeNull();
    expect(new URL(String(fetchMock.mock.calls[1][0])).searchParams.get("next_page_token")).toBe(
      "TOKEN_PAGINA_2",
    );
    expect(fetchMock.mock.calls[0][1].headers.Authorization).toBe("Bearer tok");
  });

  it.each([
    ["ventana completa", "2026-11-03", "2026-11-30"],
    ["año bisiesto", "2028-02-01", "2028-02-28"],
    ["límite de año", "2026-12-10", "2027-01-06"],
    ["ventana de un día", "2026-11-03", "2026-11-03"],
  ])("el rango enviado a Zoom nunca supera 30 días (%s)", async (_nombre, desde, hasta) => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(JSON.stringify({ meetings: [], next_page_token: "" })));
    vi.stubGlobal("fetch", fetchMock);
    await listarGrabacionesAnfitrionZoomHttp("tok", "h", { ...ventana, desde, hasta }, null);
    const q = new URL(String(fetchMock.mock.calls[0][0])).searchParams;
    const dias = (Date.parse(q.get("to")!) - Date.parse(q.get("from")!)) / 86_400_000 + 1;
    expect(dias).toBeLessThanOrEqual(30);
  });

  it("consulta la papelera con trash=true", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(json(JSON.stringify({ meetings: [], next_page_token: "" })));
    vi.stubGlobal("fetch", fetchMock);
    await listarGrabacionesAnfitrionZoomHttp("tok", "h", { ...ventana, papelera: true }, null);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.searchParams.get("trash")).toBe("true");
    expect(url.searchParams.get("trash_type")).toBe("meeting_recordings");
  });

  it("falla con un cursor repetido en lugar de entrar en bucle", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(JSON.stringify({ meetings: [], next_page_token: "MISMO" }))),
    );
    const error = await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, "MISMO"));
    expect(error.code).toBe("PAGINACION_REPETIDA");
  });

  it("no da por completo un listado con respuesta incompleta", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(json(JSON.stringify({ next_page_token: "" })))
        .mockResolvedValueOnce(
          json(JSON.stringify({ meetings: [{ id: 1, start_time: "2026-11-05T14:00:00Z" }] })),
        ),
    );
    expect(
      (await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, null))).code,
    ).toBe("RESPUESTA_INCOMPLETA");
    expect(
      (await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, null))).code,
    ).toBe("RESPUESTA_INCOMPLETA");
  });

  it("rechaza ventanas de más de 28 días sin consultar Zoom", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const error = await errorDe(
      listarGrabacionesAnfitrionZoomHttp(
        "tok",
        "h",
        { ...ventana, desde: "2026-11-01", hasta: "2026-11-29" },
        null,
      ),
    );
    expect(error.code).toBe("VENTANA_INVALIDA");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("propaga el rechazo de Zoom como error, no como página vacía, sin copiar su cuerpo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json(
            JSON.stringify({ code: 300, message: "The next page token is invalid or expired." }),
            400,
          ),
        ),
    );
    const error = await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, "viejo"));
    expect(error.code).toBe("SOLICITUD_RECHAZADA");
    expect(error.message).not.toContain("next page token");
  });

  it("conserva solo el código numérico de Zoom para diagnosticar, nunca el mensaje ni cuerpos no numéricos", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json(
            JSON.stringify({ code: 300, message: "Invalid parameter: to https://x?token=SECRETO" }),
            400,
          ),
        ),
    );
    const error = await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, null));
    expect(error.codigoZoom).toBe(300);
    expect(error.message).not.toMatch(/SECRETO|Invalid parameter|https?:/);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json("<html>no es json</html>", 400)));
    expect(
      (await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, null))).codigoZoom,
    ).toBeNull();
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json(JSON.stringify({ code: "con texto" }), 400)),
    );
    expect(
      (await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, null))).codigoZoom,
    ).toBeNull();
  });

  it("403 se informa como capacidad pendiente", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json("{}", 403)));
    expect(
      (await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, null))).code,
    ).toBe("CAPACIDAD_PENDIENTE");
  });
});

describe("inventario de una ocurrencia", () => {
  const referencia = {
    cuentaZoomId: "cuenta-1",
    uuid: "AbCdEf1234567890+/==",
    meetingId: "81234567890",
    anfitrionZoomId: "HOST_SANEADO_1",
    inicioRealAt: new Date("2026-11-05T14:02:11Z"),
    titulo: "x",
  };

  it("codifica dos veces un UUID con / y una sola vez uno común", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        json(fixture("recordings-ocurrencia").replace("AbCdEf1234567890+/==", "/ab//cd==")),
      );
    vi.stubGlobal("fetch", fetchMock);
    await obtenerInventarioOcurrenciaZoomHttp("tok", "/ab//cd==");
    expect(String(fetchMock.mock.calls[0][0])).toContain(
      "/meetings/%252Fab%252F%252Fcd%253D%253D/recordings",
    );

    fetchMock.mockResolvedValue(
      json(fixture("recordings-ocurrencia").replace("AbCdEf1234567890+/==", "abc+def==")),
    );
    await obtenerInventarioOcurrenciaZoomHttp("tok", "abc+def==");
    expect(String(fetchMock.mock.calls[1][0])).toContain("/meetings/abc%2Bdef%3D%3D/recordings");
  });

  it("entrega recursos sin exponer URLs al serializar y conserva audios individuales", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json(fixture("recordings-ocurrencia"))));
    const inventario = await obtenerInventarioOcurrenciaZoomHttp("tok", "AbCdEf1234567890+/==");
    expect(inventario).not.toBeNull();
    const serializado = JSON.stringify(inventario);
    expect(serializado).not.toContain("download_url");
    expect(serializado).not.toContain("zoom.us/rec");
    expect(serializado).not.toContain("SANEADA");
    expect(serializado).not.toContain("SANEADO-");
    const resultado = normalizarInventarioZoom(referencia, inventario!.respuesta, sha);
    expect(resultado.recursos.map((r) => r.archivoZoomId).sort()).toEqual([
      "f-aud-1",
      "f-mp4-1",
      "f-tl-1",
    ]);
    expect(resultado.recursos.every((r) => r.descargable)).toBe(true);
    expect(inventario!.urlDescarga("f-aud-1")).toBe("https://zoom.us/rec/download/SANEADO-4");
    expect(inventario!.urlDescarga("no-existe")).toBeNull();
  });

  it("distingue 404 (sin inventario) de un inventario vacío", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(new Response(null, { status: 404 }))
        .mockResolvedValueOnce(json(JSON.stringify({ uuid: "u", id: 1, recording_files: [] }))),
    );
    expect(await obtenerInventarioOcurrenciaZoomHttp("tok", "u")).toBeNull();
    const vacio = await obtenerInventarioOcurrenciaZoomHttp("tok", "u");
    expect(vacio).not.toBeNull();
    expect(normalizarInventarioZoom(referencia, vacio!.respuesta, sha).recursos).toEqual([]);
  });

  it("rechaza una respuesta cuya identidad no coincide con la ocurrencia pedida", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json(JSON.stringify({ uuid: "otra", id: 81234567890, recording_files: [] })),
        ),
    );
    expect((await errorDe(obtenerInventarioOcurrenciaZoomHttp("tok", "pedida"))).code).toBe(
      "IDENTIDAD_INCONSISTENTE",
    );
  });

  it("403 es capacidad pendiente y no un inventario vacío", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json("{}", 403)));
    const error = await errorDe(obtenerInventarioOcurrenciaZoomHttp("tok", "u"));
    expect(error.code).toBe("CAPACIDAD_PENDIENTE");
    expect(error.recurso).toBe("grabaciones.inventario");
  });

  it("401 renueva el token una sola vez y el segundo intento usa un token distinto", async () => {
    const creds = { accountId: "acc-rec-401", clientId: "cli-rec-401", clientSecret: "s" };
    const tokens = ["token-viejo", "token-nuevo"];
    let emitidos = 0;
    const llamadasApi: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).startsWith("https://zoom.us/oauth/token")) {
          return new Response(
            JSON.stringify({ access_token: tokens[emitidos++], expires_in: 3600 }),
            {
              status: 200,
            },
          );
        }
        const auth = String((init?.headers as Record<string, string>)["Authorization"]);
        llamadasApi.push(auth);
        return auth === "Bearer token-viejo"
          ? new Response("{}", { status: 401 })
          : json(fixture("recordings-ocurrencia"));
      }),
    );
    const inventario = await obtenerInventarioOcurrenciaZoomHttp(
      crearProveedorTokenZoom(creds),
      "AbCdEf1234567890+/==",
    );
    expect(inventario).not.toBeNull();
    expect(llamadasApi).toEqual(["Bearer token-viejo", "Bearer token-nuevo"]);
    expect(emitidos).toBe(2);
  });

  it("un segundo 401 no reintenta de nuevo", async () => {
    const creds = { accountId: "acc-rec-401b", clientId: "cli-rec-401b", clientSecret: "s" };
    let n = 0;
    let llamadasApi = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL) => {
        if (String(url).startsWith("https://zoom.us/oauth/token")) {
          return new Response(JSON.stringify({ access_token: `t${n++}`, expires_in: 3600 }), {
            status: 200,
          });
        }
        llamadasApi += 1;
        return new Response("{}", { status: 401 });
      }),
    );
    const error = await errorDe(
      obtenerInventarioOcurrenciaZoomHttp(crearProveedorTokenZoom(creds), "u"),
    );
    expect(error.code).toBe("NO_AUTORIZADO");
    expect(llamadasApi).toBe(2);
  });

  it("con token plano, un 401 es error sin reintento", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fetchMock);
    expect((await errorDe(obtenerInventarioOcurrenciaZoomHttp("tok", "u"))).code).toBe(
      "NO_AUTORIZADO",
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("429 respeta Retry-After y reintenta una sola vez", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("{}", { status: 429, headers: { "Retry-After": "3" } }))
      .mockResolvedValueOnce(json(JSON.stringify({ uuid: "u", id: 1, recording_files: [] })));
    vi.stubGlobal("fetch", fetchMock);
    const promesa = obtenerInventarioOcurrenciaZoomHttp("tok", "u");
    await vi.advanceTimersByTimeAsync(2900);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(200);
    expect(await promesa).not.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un segundo 429 se informa sin más reintentos", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockImplementation(
        async () => new Response("{}", { status: 429, headers: { "Retry-After": "1" } }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const promesa = errorDe(obtenerInventarioOcurrenciaZoomHttp("tok", "u"));
    await vi.advanceTimersByTimeAsync(5000);
    const error = await promesa;
    expect(error.code).toBe("LIMITE_TASA");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("un Retry-After excesivo no bloquea al worker", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(new Response("{}", { status: 429, headers: { "Retry-After": "3600" } }));
    vi.stubGlobal("fetch", fetchMock);
    const error = await errorDe(obtenerInventarioOcurrenciaZoomHttp("tok", "u"));
    expect(error.code).toBe("LIMITE_TASA");
    expect(error.reintentarEnSegundos).toBe(3600);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("los errores públicos no incluyen cuerpos crudos ni URLs firmadas", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(json("https://cdn.zoom.us/firmada?token=SECRETO", 500)),
    );
    const error = await errorDe(obtenerInventarioOcurrenciaZoomHttp("tok", "u"));
    expect(error.code).toBe("ERROR_ZOOM");
    expect(`${error.message} ${error.recurso}`).not.toContain("SECRETO");
  });
});

describe("errores de red", () => {
  it("no filtran la URL firmada contenida en el error de fetch", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValue(
          new TypeError("fetch failed: https://ssrweb.zoom.us/x?Signature=SECRETO"),
        ),
    );
    const inventario = await errorDe(obtenerInventarioOcurrenciaZoomHttp("tok", "u"));
    const listado = await errorDe(listarGrabacionesAnfitrionZoomHttp("tok", "h", ventana, null));
    for (const e of [inventario, listado]) {
      expect(e.code).toBe("ERROR_RED");
      expect(`${e.message} ${e.recurso}`).not.toContain("SECRETO");
    }
  });
});

describe("resumen de AI Companion", () => {
  it("scope faltante es capacidad pendiente, no ausencia", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          json(
            JSON.stringify({
              code: 4711,
              message: "Invalid access token, does not contain scopes",
            }),
            403,
          ),
        ),
    );
    expect(await obtenerResumenReunionZoomHttp("tok", "u")).toEqual({
      estado: "CAPACIDAD_PENDIENTE",
      recurso: "meeting_summary",
    });
  });

  it("devuelve el resumen disponible y 404 como no disponible", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          json(JSON.stringify({ meeting_uuid: "u", summary_overview: "Resumen" })),
        )
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    expect(await obtenerResumenReunionZoomHttp("tok", "u")).toEqual({
      estado: "DISPONIBLE",
      resumen: { meeting_uuid: "u", summary_overview: "Resumen" },
    });
    expect(await obtenerResumenReunionZoomHttp("tok", "u")).toEqual({ estado: "NO_DISPONIBLE" });
  });
});
