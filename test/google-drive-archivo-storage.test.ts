import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import { GoogleDriveArchivoStorageAdapter } from "../src/modules/archivos/infrastructure/google/google-drive-archivo-storage.adapter";

const H = "a".repeat(64);
function crear(...respuestas: Array<Record<string, unknown>>) {
  const request = vi.fn();
  for (const r of respuestas) request.mockResolvedValueOnce(r);
  const adapter = new GoogleDriveArchivoStorageAdapter({
    auth: { request } as unknown as JWT, cifrar: (v) => `enc(${v})`, descifrar: (v) => v.slice(4, -1)
  });
  return { adapter, request };
}

describe("GoogleDriveArchivoStorageAdapter", () => {
  it("devuelve la sesión cifrada y la descifra solo al usarla", async () => {
    const { adapter, request } = crear(
      { status: 200, headers: { location: "https://www.googleapis.com/upload?id=1" }, data: "" },
      { status: 308, headers: { range: "bytes=0-262143" }, data: "" }
    );
    const sesion = await adapter.iniciarSubida({ fileId: "f", nombre: "n", carpetaId: "c", mimeType: "video/mp4", tamanoTotal: null }, H);
    expect(sesion).toBe("enc(https://www.googleapis.com/upload?id=1)");
    expect(await adapter.consultarSubida(sesion, null)).toEqual({ estado: "PARCIAL", bytesConfirmados: 262144n });
    expect(request.mock.calls[1][0].url).toBe("https://www.googleapis.com/upload?id=1");
  });

  it("reconcilia primero por ID y solo después por marca de origen", async () => {
    const { adapter, request } = crear({ status: 200, data: { id: "f", name: "n", size: "7", trashed: false } });
    const r = await adapter.buscarConservado(H, "f");
    expect(r).toMatchObject({ tipo: "UNO", destino: { id: "f", tamanoBytes: 7n } });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("sin archivo por ID busca por marca; 0 → NINGUNO, 2 → AMBIGUO", async () => {
    const a = crear({ status: 404, data: "" }, { status: 200, data: { files: [] } });
    expect(await a.adapter.buscarConservado(H, "f")).toEqual({ tipo: "NINGUNO" });
    const b = crear({ status: 200, data: { files: [{ id: "1" }, { id: "2" }] } });
    expect(await b.adapter.buscarConservado(H, null)).toEqual({ tipo: "AMBIGUO", cantidad: 2 });
  });

  it("nunca solicita permisos por enlace", async () => {
    const { adapter, request } = crear(
      { status: 200, headers: { location: "https://x" }, data: "" },
      { status: 200, data: { id: "f", size: "1" } }
    );
    await adapter.iniciarSubida({ fileId: "f", nombre: "n", carpetaId: "c", mimeType: "video/mp4", tamanoTotal: 1n }, H);
    await adapter.verificarArchivo("f");
    expect(request.mock.calls.some(([c]) => String(c.url).includes("/permissions"))).toBe(false);
  });
});
