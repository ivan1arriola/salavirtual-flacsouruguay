import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import {
  DRIVE_BLOQUE_MULTIPLO_BYTES,
  DRIVE_ZOOM_ORIGEN_PROPERTY,
  consultarSubidaDriveReanudable,
  verificarEscrituraCarpetaDrive,
  iniciarSubidaDriveReanudable,
  subirBloqueDriveReanudable
} from "../src/integrations/google/drive/drive-resumable.client";

function cliente(...respuestas: Array<Record<string, unknown>>) {
  const request = vi.fn();
  for (const r of respuestas) request.mockResolvedValueOnce(r);
  return { request, auth: { request } as unknown as JWT };
}

const SESION = "https://www.googleapis.com/upload/drive/v3/files?upload_id=abc";
const ARCHIVO = { id: "drive-1", name: "a.mp4", mimeType: "video/mp4", size: "10" };

describe("Drive reanudable: inicio de sesión", () => {
  it("usa el ID pregenerado, appProperties y supportsAllDrives en el mismo POST", async () => {
    const { request, auth } = cliente({ status: 200, headers: { location: SESION }, data: "" });
    const sesion = await iniciarSubidaDriveReanudable(auth, {
      fileId: "drive-1", nombre: "a.mp4", carpetaId: "carpeta", mimeType: "video/mp4",
      origenHash: "h".repeat(64), tamanoTotal: 10n
    });
    expect(sesion).toBe(SESION);
    const arg = request.mock.calls[0][0];
    expect(arg.method).toBe("POST");
    expect(arg.url).toContain("uploadType=resumable");
    expect(arg.url).toContain("supportsAllDrives=true");
    expect(arg.data).toMatchObject({
      id: "drive-1", name: "a.mp4", parents: ["carpeta"],
      appProperties: { [DRIVE_ZOOM_ORIGEN_PROPERTY]: "h".repeat(64) }
    });
    expect(arg.headers["X-Upload-Content-Length"]).toBe("10");
  });

  it("omite la longitud cuando el tamaño es desconocido y rechaza respuestas sin Location", async () => {
    const { request, auth } = cliente(
      { status: 200, headers: { location: SESION }, data: "" },
      { status: 200, headers: {}, data: "" }
    );
    const base = { fileId: "d", nombre: "n", carpetaId: "c", mimeType: "video/mp4", origenHash: "h".repeat(64) };
    await iniciarSubidaDriveReanudable(auth, { ...base, tamanoTotal: null });
    expect(request.mock.calls[0][0].headers["X-Upload-Content-Length"]).toBeUndefined();
    await expect(iniciarSubidaDriveReanudable(auth, { ...base, tamanoTotal: null }))
      .rejects.toThrow(/sesión/i);
  });
});

describe("Drive reanudable: consulta del offset confirmado", () => {
  it("308 sin Range significa 0 bytes", async () => {
    const { auth, request } = cliente({ status: 308, headers: {}, data: "" });
    expect(await consultarSubidaDriveReanudable(auth, SESION, 100n)).toEqual({ estado: "PARCIAL", bytesConfirmados: 0n });
    expect(request.mock.calls[0][0].headers["Content-Range"]).toBe("bytes */100");
  });

  it("308 con Range bytes=0-N confirma N+1", async () => {
    const { auth } = cliente({ status: 308, headers: { range: "bytes=0-262143" }, data: "" });
    expect(await consultarSubidaDriveReanudable(auth, SESION, 1000n))
      .toEqual({ estado: "PARCIAL", bytesConfirmados: 262144n });
  });

  it("200 y 201 son finalización con el archivo, nunca el 308", async () => {
    const { auth } = cliente({ status: 200, headers: {}, data: ARCHIVO }, { status: 201, headers: {}, data: ARCHIVO });
    expect((await consultarSubidaDriveReanudable(auth, SESION, 10n)).estado).toBe("COMPLETA");
    expect((await consultarSubidaDriveReanudable(auth, SESION, 10n)).estado).toBe("COMPLETA");
  });

  it("404 y 410 significan sesión vencida", async () => {
    const { auth } = cliente({ status: 404, headers: {}, data: "" }, { status: 410, headers: {}, data: "" });
    expect(await consultarSubidaDriveReanudable(auth, SESION, 10n)).toEqual({ estado: "VENCIDA" });
    expect(await consultarSubidaDriveReanudable(auth, SESION, 10n)).toEqual({ estado: "VENCIDA" });
  });

  it("tamaño desconocido consulta con */*", async () => {
    const { auth, request } = cliente({ status: 308, headers: {}, data: "" });
    await consultarSubidaDriveReanudable(auth, SESION, null);
    expect(request.mock.calls[0][0].headers["Content-Range"]).toBe("bytes */*");
  });

  it("un estado inesperado falla sin devolver el cuerpo crudo", async () => {
    const { auth } = cliente({ status: 500, headers: {}, data: "secreto-interno" });
    const error = await consultarSubidaDriveReanudable(auth, SESION, 10n).catch((e: Error) => e);
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).not.toContain("secreto-interno");
    expect((error as Error).message).not.toContain("upload_id");
  });
});

describe("Drive reanudable: subida de bloques", () => {
  const bytes = new Uint8Array(DRIVE_BLOQUE_MULTIPLO_BYTES);

  it("un 308 de subida es progreso, jamás finalización", async () => {
    const { auth, request } = cliente({ status: 308, headers: { range: `bytes=0-${DRIVE_BLOQUE_MULTIPLO_BYTES - 1}` }, data: "" });
    const r = await subirBloqueDriveReanudable(auth, SESION, 0n, bytes, 10n * BigInt(DRIVE_BLOQUE_MULTIPLO_BYTES));
    expect(r).toEqual({ estado: "PARCIAL", bytesConfirmados: BigInt(DRIVE_BLOQUE_MULTIPLO_BYTES) });
    expect(request.mock.calls[0][0].headers["Content-Range"])
      .toBe(`bytes 0-${DRIVE_BLOQUE_MULTIPLO_BYTES - 1}/${10 * DRIVE_BLOQUE_MULTIPLO_BYTES}`);
  });

  it("el último bloque declara el total real aun cuando era desconocido", async () => {
    const { auth, request } = cliente({ status: 200, headers: {}, data: { ...ARCHIVO, size: "5" } });
    const r = await subirBloqueDriveReanudable(auth, SESION, 0n, new Uint8Array(5), null, { ultimo: true });
    expect(r.estado).toBe("COMPLETA");
    expect(request.mock.calls[0][0].headers["Content-Range"]).toBe("bytes 0-4/5");
  });

  it("bloque intermedio de tamaño desconocido usa */", async () => {
    const { auth, request } = cliente({ status: 308, headers: { range: `bytes=0-${DRIVE_BLOQUE_MULTIPLO_BYTES - 1}` }, data: "" });
    await subirBloqueDriveReanudable(auth, SESION, 0n, bytes, null);
    expect(request.mock.calls[0][0].headers["Content-Range"]).toBe(`bytes 0-${DRIVE_BLOQUE_MULTIPLO_BYTES - 1}/*`);
  });

  it("destino vacío válido: 0 bytes se finaliza con bytes */0", async () => {
    const { auth, request } = cliente({ status: 200, headers: {}, data: { ...ARCHIVO, size: "0" } });
    const r = await subirBloqueDriveReanudable(auth, SESION, 0n, new Uint8Array(0), 0n, { ultimo: true });
    expect(r.estado).toBe("COMPLETA");
    expect(request.mock.calls[0][0].headers["Content-Range"]).toBe("bytes */0");
  });

  it("propaga la señal de aborto y no acepta bloques intermedios que no sean múltiplo de 256 KiB", async () => {
    const { auth, request } = cliente({ status: 308, headers: {}, data: "" });
    const control = new AbortController();
    await subirBloqueDriveReanudable(auth, SESION, 0n, bytes, null, { signal: control.signal });
    expect(request.mock.calls[0][0].signal).toBe(control.signal);
    await expect(subirBloqueDriveReanudable(auth, SESION, 0n, new Uint8Array(10), null))
      .rejects.toThrow(/256/);
  });

  it("sesión vencida durante el PUT se informa como VENCIDA", async () => {
    const { auth } = cliente({ status: 410, headers: {}, data: "" });
    expect(await subirBloqueDriveReanudable(auth, SESION, 0n, bytes, null)).toEqual({ estado: "VENCIDA" });
  });
});

describe("Drive reanudable: comprobación de escritura (healthcheck del worker)", () => {
  it("true solo si es una carpeta con canAddChildren, con supportsAllDrives", async () => {
    const { auth, request } = cliente({ status: 200, data: { id: "c", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: true } } });
    expect(await verificarEscrituraCarpetaDrive(auth, "c")).toBe(true);
    expect(request.mock.calls[0][0].url).toContain("supportsAllDrives=true");
    expect(request.mock.calls[0][0].url).toContain("capabilities");
  });
  it("false sin permiso, si no es carpeta o si no existe", async () => {
    const { auth } = cliente(
      { status: 200, data: { id: "c", mimeType: "application/vnd.google-apps.folder", capabilities: { canAddChildren: false } } },
      { status: 200, data: { id: "c", mimeType: "video/mp4", capabilities: { canAddChildren: true } } },
      { status: 404, data: "" }
    );
    expect(await verificarEscrituraCarpetaDrive(auth, "c")).toBe(false);
    expect(await verificarEscrituraCarpetaDrive(auth, "c")).toBe(false);
    expect(await verificarEscrituraCarpetaDrive(auth, "c")).toBe(false);
  });
});

describe("Drive reanudable: encabezados como Headers (gaxios 8 devuelve un objeto Headers, no uno plano)", () => {
  it("lee Location de un Headers real al iniciar la sesión", async () => {
    const { auth } = cliente({ status: 200, headers: new Headers({ Location: SESION }), data: "" });
    expect(await iniciarSubidaDriveReanudable(auth, {
      fileId: "drive-1", nombre: "a.mp4", carpetaId: "carpeta", mimeType: "video/mp4", origenHash: "h".repeat(64), tamanoTotal: 10n
    })).toBe(SESION);
  });

  it("lee Range de un Headers real en una respuesta 308: el progreso confirmado no se pierde", async () => {
    const { auth } = cliente({ status: 308, headers: new Headers({ Range: "bytes=0-262143" }), data: "" });
    const r = await consultarSubidaDriveReanudable(auth, SESION, 10n);
    expect(r).toEqual({ estado: "PARCIAL", bytesConfirmados: 262144n });
  });

  it("un 308 sin Range de un Headers significa 0 bytes confirmados", async () => {
    const { auth } = cliente({ status: 308, headers: new Headers(), data: "" });
    expect(await consultarSubidaDriveReanudable(auth, SESION, 10n)).toEqual({ estado: "PARCIAL", bytesConfirmados: 0n });
  });
});
