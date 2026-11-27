import { afterEach, describe, expect, it, vi } from "vitest";
import {
  abrirDescargaZoomHttp,
  type DescargaZoomHttp,
} from "@/src/integrations/zoom/zoom-download.client";
import { ZoomApiError } from "@/src/integrations/zoom/zoom-http";
import { crearProveedorTokenZoom } from "@/src/integrations/zoom/zoom-client";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

const URL_ZOOM = "https://zoom.us/rec/download/SANEADO-1";
const URL_FIRMADA = "https://ssrweb.zoom.us/archivo/SANEADO?Expires=1&Signature=SECRETO";
const bytes = (texto: string) => new TextEncoder().encode(texto);

function respuesta(cuerpo: string | null, status: number, headers: Record<string, string> = {}) {
  return new Response(cuerpo === null ? null : bytes(cuerpo), { status, headers });
}

function redireccion(destino: string, status = 302) {
  return new Response(null, { status, headers: { location: destino } });
}

async function leer(flujo: ReadableStream<Uint8Array>): Promise<string> {
  const lector = flujo.getReader();
  const partes: string[] = [];
  const decodificador = new TextDecoder();
  for (;;) {
    const { done, value } = await lector.read();
    if (done) {
      break;
    }
    partes.push(decodificador.decode(value, { stream: true }));
  }
  return partes.join("");
}

function contenido(d: DescargaZoomHttp) {
  if (d.tipo !== "CONTENIDO") {
    throw new Error(`se esperaba contenido, llegó ${d.tipo}`);
  }
  return d;
}

async function errorDe(promesa: Promise<unknown>): Promise<ZoomApiError> {
  try {
    await promesa;
  } catch (e) {
    expect(e).toBeInstanceOf(ZoomApiError);
    return e as ZoomApiError;
  }
  throw new Error("se esperaba un error");
}

const señal = () => new AbortController().signal;

describe("descarga de archivos Zoom", () => {
  it("pide la URL con redirect manual y Authorization, y sigue el Location firmado sin Authorization", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redireccion(URL_FIRMADA))
      .mockResolvedValueOnce(
        respuesta("lmnop", 206, {
          "content-range": "bytes 5-9/10",
          "content-length": "5",
          "content-type": "video/mp4",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const s = señal();
    const d = contenido(await abrirDescargaZoomHttp("tok", URL_ZOOM, 5, s));

    const [url1, init1] = fetchMock.mock.calls[0];
    expect(String(url1)).toBe(URL_ZOOM);
    expect(init1.redirect).toBe("manual");
    expect(init1.headers.Authorization).toBe("Bearer tok");
    expect(init1.signal).toBeDefined();

    const [url2, init2] = fetchMock.mock.calls[1];
    expect(String(url2)).toBe(URL_FIRMADA);
    expect(init2.redirect).toBe("manual");
    expect(init2.headers.Authorization).toBeUndefined();
    expect(init2.headers.Range).toBe("bytes=5-");

    expect(d.modo).toBe("PARCIAL");
    expect(d.etiquetas).toEqual([]);
    expect(d.totalBytes).toBe(10n);
    expect(await leer(d.contenido)).toBe("lmnop");
    expect(d.bytesRecibidos()).toBe(5n);
  });

  it("descarga completa desde offset 0 sin Range", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        respuesta("abcdefghij", 200, { "content-length": "10", "content-type": "video/mp4" }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const d = contenido(await abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    expect(fetchMock.mock.calls[0][1].headers.Range).toBeUndefined();
    expect(d.modo).toBe("COMPLETO");
    expect(d.totalBytes).toBe(10n);
    expect(await leer(d.contenido)).toBe("abcdefghij");
  });

  it("rechaza un 206 cuyo Content-Range no empieza en el offset pedido", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          respuesta("xxxxx", 206, { "content-range": "bytes 0-4/10", "content-length": "5" }),
        ),
    );
    expect((await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 5, señal()))).code).toBe(
      "CONTENT_RANGE_INVALIDO",
    );
  });

  it("rechaza un 206 sin Content-Range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuesta("xxxxx", 206, { "content-length": "5" })),
    );
    expect((await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 5, señal()))).code).toBe(
      "CONTENT_RANGE_INVALIDO",
    );
  });

  it("falla el flujo si llegan menos bytes que los anunciados por Content-Range", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuesta("lmn", 206, { "content-range": "bytes 5-9/10" })),
    );
    const d = contenido(await abrirDescargaZoomHttp("tok", URL_ZOOM, 5, señal()));
    await expect(leer(d.contenido)).rejects.toMatchObject({ code: "TAMANO_INCONSISTENTE" });
  });

  it("falla el flujo si llegan más bytes que los anunciados", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuesta("lmnopqr", 206, { "content-range": "bytes 5-9/10" })),
    );
    const d = contenido(await abrirDescargaZoomHttp("tok", URL_ZOOM, 5, señal()));
    await expect(leer(d.contenido)).rejects.toMatchObject({ code: "TAMANO_INCONSISTENTE" });
  });

  it("etiqueta RANGE_IGNORADO y descarta el prefijo cuando Zoom responde 200 con offset > 0", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(respuesta("abcdefghij", 200, { "content-length": "10" })),
    );
    const d = contenido(await abrirDescargaZoomHttp("tok", URL_ZOOM, 4, señal()));
    expect(d.etiquetas).toEqual(["RANGE_IGNORADO"]);
    expect(d.modo).toBe("PARCIAL");
    expect(d.totalBytes).toBe(10n);
    expect(await leer(d.contenido)).toBe("efghij");
    expect(d.bytesRecibidos()).toBe(6n);
  });

  it("marca REQUIERE_REVISION en lugar de descartar un prefijo mayor al máximo configurado", async () => {
    vi.stubEnv("ZOOM_ARCHIVOS_MAX_DESCARTE_GB", "0.000001");
    const cancelar = vi.fn();
    const cuerpo = new ReadableStream<Uint8Array>({
      pull(c) {
        c.enqueue(bytes("x"));
      },
      cancel: cancelar,
    });
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          new Response(cuerpo, { status: 200, headers: { "content-length": "100000" } }),
        ),
    );
    const d = await abrirDescargaZoomHttp("tok", URL_ZOOM, 50_000, señal());
    expect(d).toEqual({
      tipo: "REQUIERE_REVISION",
      motivo: "RANGE_IGNORADO_DESCARTE_EXCEDE_MAXIMO",
    });
    expect(cancelar).toHaveBeenCalled();
  });

  it("mide por stream cuando Zoom no informa el tamaño", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(respuesta("sin tamano anunciado", 200)));
    const d = contenido(await abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    expect(d.totalBytes).toBeNull();
    expect(d.bytesEsperados).toBeNull();
    expect(await leer(d.contenido)).toBe("sin tamano anunciado");
    expect(d.bytesRecibidos()).toBe(20n);
  });

  it("no acepta HTML ni JSON de error con 200 como si fuera el archivo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(
          respuesta("<html>login</html>", 200, { "content-type": "text/html; charset=utf-8" }),
        )
        .mockResolvedValueOnce(
          respuesta('{"code":124,"message":"Invalid access token"}', 200, {
            "content-type": "application/json",
          }),
        ),
    );
    expect((await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()))).code).toBe(
      "CONTENIDO_NO_ES_ARCHIVO",
    );
    expect((await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()))).code).toBe(
      "CONTENIDO_NO_ES_ARCHIVO",
    );
  });

  it("acepta JSON cuando el archivo esperado es JSON (TIMELINE)", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValue(
          respuesta('{"timeline":[]}', 200, { "content-type": "application/json" }),
        ),
    );
    const d = contenido(
      await abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal(), { permitirJson: true }),
    );
    expect(await leer(d.contenido)).toBe('{"timeline":[]}');
  });

  it("no envía credenciales a hosts fuera de la lista ni a URLs no HTTPS", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(
      (
        await errorDe(
          abrirDescargaZoomHttp("tok", "https://evil.example.com/rec/download/x", 0, señal()),
        )
      ).code,
    ).toBe("HOST_NO_PERMITIDO");
    expect(
      (
        await errorDe(
          abrirDescargaZoomHttp("tok", "https://zoom.us.evil.com/rec/download/x", 0, señal()),
        )
      ).code,
    ).toBe("HOST_NO_PERMITIDO");
    expect(
      (await errorDe(abrirDescargaZoomHttp("tok", "http://zoom.us/rec/download/x", 0, señal())))
        .code,
    ).toBe("HOST_NO_PERMITIDO");
    expect((await errorDe(abrirDescargaZoomHttp("tok", "no es url", 0, señal()))).code).toBe(
      "HOST_NO_PERMITIDO",
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("rechaza redirecciones a destinos no HTTPS o fuera de los hosts configurados", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(redireccion("https://atacante.example.net/x?firma=SECRETO"))
        .mockResolvedValueOnce(redireccion("http://ssrweb.zoom.us/x?firma=SECRETO")),
    );
    const e1 = await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    expect(e1.code).toBe("DESTINO_NO_PERMITIDO");
    expect(`${e1.message} ${e1.recurso}`).not.toContain("SECRETO");
    expect((await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()))).code).toBe(
      "DESTINO_NO_PERMITIDO",
    );
  });

  it("acepta destinos de CDN configurados por entorno", async () => {
    vi.stubEnv("ZOOM_ARCHIVOS_HOSTS_CDN", "*.cdn-regional.example");
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(redireccion("https://eu1.cdn-regional.example/f?firma=1", 301))
      .mockResolvedValueOnce(respuesta("ok", 200, { "content-length": "2" }));
    vi.stubGlobal("fetch", fetchMock);
    const d = contenido(await abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    expect(await leer(d.contenido)).toBe("ok");
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBeUndefined();
  });

  it("limita la cantidad de redirecciones", async () => {
    const fetchMock = vi.fn().mockImplementation(async () => redireccion(URL_FIRMADA));
    vi.stubGlobal("fetch", fetchMock);
    const error = await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    expect(error.code).toBe("REDIRECCIONES_EXCESIVAS");
    expect(fetchMock.mock.calls.length).toBeLessThanOrEqual(5);
  });

  it("renueva el token una vez ante 401 en el primer salto", async () => {
    const creds = { accountId: "acc-dl-401", clientId: "cli-dl-401", clientSecret: "s" };
    let emitidos = 0;
    const auths: string[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL, init?: RequestInit) => {
        if (String(url).startsWith("https://zoom.us/oauth/token")) {
          return new Response(
            JSON.stringify({ access_token: `t${++emitidos}`, expires_in: 3600 }),
            {
              status: 200,
            },
          );
        }
        auths.push(String((init?.headers as Record<string, string>)["Authorization"]));
        return auths.length === 1
          ? new Response(null, { status: 401 })
          : respuesta("ok", 200, { "content-length": "2" });
      }),
    );
    const d = contenido(
      await abrirDescargaZoomHttp(crearProveedorTokenZoom(creds), URL_ZOOM, 0, señal()),
    );
    expect(await leer(d.contenido)).toBe("ok");
    expect(auths).toEqual(["Bearer t1", "Bearer t2"]);
  });

  it("errores HTTP llevan código y recurso interno, sin URL ni cuerpo", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(redireccion(URL_FIRMADA))
        .mockResolvedValueOnce(respuesta("<Error>SECRETO</Error>", 403))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    const e403 = await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    expect(e403.code).toBe("DESCARGA_RECHAZADA");
    expect(e403.recurso).toBe("descarga");
    expect(`${e403.message} ${e403.recurso}`).not.toMatch(/SECRETO|ssrweb|Signature/);
    expect((await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()))).code).toBe(
      "NO_ENCONTRADO",
    );
  });

  it("errores de red no filtran la URL ni el Location firmados", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockRejectedValueOnce(new TypeError(`fetch failed ${URL_ZOOM}`))
        .mockResolvedValueOnce(redireccion(URL_FIRMADA))
        .mockRejectedValueOnce(new TypeError(`fetch failed ${URL_FIRMADA}`)),
    );
    const e1 = await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    const e2 = await errorDe(abrirDescargaZoomHttp("tok", URL_ZOOM, 0, señal()));
    for (const e of [e1, e2]) {
      expect(e.code).toBe("ERROR_RED");
      expect(`${e.message} ${e.recurso}`).not.toMatch(/SECRETO|Signature|ssrweb|SANEADO/);
    }
  });
});
