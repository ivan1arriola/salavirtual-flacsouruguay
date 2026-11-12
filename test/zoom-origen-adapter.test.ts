/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const inventario = vi.fn();
const listado = vi.fn();
const descarga = vi.fn();
vi.mock("../src/integrations/zoom/zoom-recordings.client", () => ({
  obtenerInventarioOcurrenciaZoomHttp: (...a: unknown[]) => inventario(...a),
  listarGrabacionesAnfitrionZoomHttp: (...a: unknown[]) => listado(...a)
}));
vi.mock("../src/integrations/zoom/zoom-download.client", () => ({
  abrirDescargaZoomHttp: (...a: unknown[]) => descarga(...a)
}));

import { crearZoomOrigenAdapter } from "../src/modules/archivos/infrastructure/zoom/zoom-origen.adapter";

const hash = (t: string) => `h(${t})`.padEnd(24, "0");
const ref = {
  cuentaZoomId: "acct",
  uuid: "u/1",
  meetingId: "9",
  anfitrionZoomId: "h1",
  inicioRealAt: new Date("2026-11-08T10:00:00Z"),
  titulo: "Clase"
};
const recurso: any = {
  claveOrigen: "k",
  archivoZoomId: "f1",
  coleccion: "recording_files",
  tipoOriginal: "MP4",
  variante: null,
  extension: "mp4",
  inicioAt: null,
  finAt: null,
  tamanoBytes: 10n,
  estadoOrigen: "completed",
  descargable: true
};
const AUTH = "token";

function inv(url: string | null) {
  return {
    uuid: "u/1",
    meetingId: "9",
    respuesta: { recording_files: [{ id: "f1", file_type: "MP4", status: "completed", file_size: 10 }] },
    urlDescarga: vi.fn(() => url)
  };
}

beforeEach(() => {
  inventario.mockReset();
  listado.mockReset();
  descarga.mockReset();
});

describe("crearZoomOrigenAdapter", () => {
  const origen = () => crearZoomOrigenAdapter({ auth: AUTH, cuentaZoomId: "acct", hash });

  it("obtenerInventario devuelve null ante 404 y normaliza el resto", async () => {
    inventario.mockResolvedValueOnce(null);
    expect(await origen().obtenerInventario(ref)).toBeNull();
    inventario.mockResolvedValueOnce(inv("https://zoom.us/rec/x"));
    const r = await origen().obtenerInventario(ref);
    expect(r?.recursos).toHaveLength(1);
    expect(r?.recursos[0]).toMatchObject({ archivoZoomId: "f1", tipoOriginal: "MP4" });
  });

  it("listarOcurrencias agrega la cuenta a la ventana", async () => {
    listado.mockResolvedValueOnce({ elementos: [], siguiente: null });
    await origen().listarOcurrencias(
      { cuentaZoomId: "acct", anfitrionZoomId: "h1", cuentaProveedorId: "p" },
      { desde: "2026-11-01", hasta: "2026-11-09" },
      "cur"
    );
    expect(listado).toHaveBeenCalledWith(
      AUTH,
      "h1",
      { desde: "2026-11-01", hasta: "2026-11-09", cuentaZoomId: "acct" },
      "cur"
    );
  });

  it("abrirDescarga refresca el inventario en cada intento y descarga desde el offset", async () => {
    inventario.mockResolvedValue(inv("https://zoom.us/rec/x"));
    const contenido = new ReadableStream<Uint8Array>();
    descarga.mockResolvedValue({
      tipo: "CONTENIDO",
      modo: "PARCIAL",
      etiquetas: [],
      contenido,
      totalBytes: 10n,
      bytesEsperados: 5n,
      contentType: null,
      bytesRecibidos: () => 0n
    });
    const signal = new AbortController().signal;
    const r = await origen().abrirDescarga(ref, recurso, 5n, signal);
    expect(inventario).toHaveBeenCalledTimes(1);
    expect(descarga).toHaveBeenCalledWith(AUTH, "https://zoom.us/rec/x", 5n, signal, { permitirJson: false });
    expect(r).toMatchObject({ tipo: "CONTENIDO", offsetOrigen: 5n, totalBytes: 10n });
  });

  it("modo COMPLETO empieza en 0 aunque se haya pedido un offset", async () => {
    inventario.mockResolvedValue(inv("https://zoom.us/rec/x"));
    descarga.mockResolvedValue({
      tipo: "CONTENIDO",
      modo: "COMPLETO",
      etiquetas: [],
      contenido: new ReadableStream(),
      totalBytes: null,
      bytesEsperados: null,
      contentType: null,
      bytesRecibidos: () => 0n
    });
    const r: any = await origen().abrirDescarga(ref, recurso, 0n, new AbortController().signal);
    expect(r.offsetOrigen).toBe(0n);
  });

  it("TIMELINE y SUMMARY permiten JSON; un archivo sin ID o sin URL requiere revisión sin descargar", async () => {
    inventario.mockResolvedValue(inv("https://zoom.us/rec/x"));
    descarga.mockResolvedValue({
      tipo: "CONTENIDO",
      modo: "COMPLETO",
      etiquetas: [],
      contenido: new ReadableStream(),
      totalBytes: null,
      bytesEsperados: null,
      contentType: null,
      bytesRecibidos: () => 0n
    });
    await origen().abrirDescarga(
      ref,
      { ...recurso, tipoOriginal: "TIMELINE" },
      0n,
      new AbortController().signal
    );
    expect(descarga.mock.calls[0]![4]).toEqual({ permitirJson: true });

    descarga.mockClear();
    const sinId = await origen().abrirDescarga(
      ref,
      { ...recurso, archivoZoomId: null },
      0n,
      new AbortController().signal
    );
    expect(sinId).toEqual({ tipo: "REQUIERE_REVISION", motivo: "RECURSO_SIN_ID" });
    inventario.mockResolvedValue(inv(null));
    const sinUrl = await origen().abrirDescarga(ref, recurso, 0n, new AbortController().signal);
    expect(sinUrl).toEqual({ tipo: "REQUIERE_REVISION", motivo: "SIN_URL_DESCARGA" });
    expect(descarga).not.toHaveBeenCalled();
  });

  it("si la ocurrencia ya no existe en Zoom (404) requiere revisión, no un inventario vacío", async () => {
    inventario.mockResolvedValue(null);
    expect(await origen().abrirDescarga(ref, recurso, 0n, new AbortController().signal)).toEqual({
      tipo: "REQUIERE_REVISION",
      motivo: "OCURRENCIA_NO_ENCONTRADA"
    });
  });

  it("propaga la revisión del cliente de descarga (descarte excesivo)", async () => {
    inventario.mockResolvedValue(inv("https://zoom.us/rec/x"));
    descarga.mockResolvedValue({
      tipo: "REQUIERE_REVISION",
      motivo: "RANGE_IGNORADO_DESCARTE_EXCEDE_MAXIMO"
    });
    expect(await origen().abrirDescarga(ref, recurso, 5n, new AbortController().signal)).toEqual({
      tipo: "REQUIERE_REVISION",
      motivo: "RANGE_IGNORADO_DESCARTE_EXCEDE_MAXIMO"
    });
  });
});
