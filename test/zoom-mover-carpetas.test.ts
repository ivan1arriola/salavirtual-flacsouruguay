import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import {
  moverElementoDriveACarpeta,
  renombrarElementoDrive,
} from "../src/integrations/google/drive/drive-files.client";
import { resolverCarpetaMesZoom } from "../src/modules/archivos/application";

const hash = (t: string) => `h(${t})`;
const INICIO = new Date("2026-03-15T14:00:00Z");

function cliente(...respuestas: Array<Record<string, unknown>>) {
  const request = vi.fn();
  for (const r of respuestas) {
    request.mockResolvedValueOnce(r);
  }
  return { request, auth: { request } as unknown as JWT };
}

describe("moverElementoDriveACarpeta", () => {
  it("quita los padres actuales y agrega el nuevo en un solo PATCH, conservando el ID", async () => {
    const { request, auth } = cliente(
      { status: 200, data: { id: "f1", parents: ["viejo"] } },
      { status: 200, data: { id: "f1", parents: ["nuevo"] } },
    );
    expect(await moverElementoDriveACarpeta(auth, "f1", "nuevo")).toBe("MOVIDA");
    const patch = request.mock.calls[1]![0];
    expect(patch.method).toBe("PATCH");
    expect(patch.url).toContain("/files/f1?");
    expect(patch.url).toContain("addParents=nuevo");
    expect(patch.url).toContain("removeParents=viejo");
    expect(patch.url).toContain("supportsAllDrives=true");
  });

  it("si ya está solo en el destino no hace nada (idempotente)", async () => {
    const { request, auth } = cliente({ status: 200, data: { id: "f1", parents: ["nuevo"] } });
    expect(await moverElementoDriveACarpeta(auth, "f1", "nuevo")).toBe("YA_EN_DESTINO");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("si el destino ya es un padre pero hay otros, quita solo los demás", async () => {
    const { request, auth } = cliente(
      { status: 200, data: { id: "f1", parents: ["otro", "nuevo"] } },
      { status: 200, data: { id: "f1", parents: ["nuevo"] } },
    );
    await moverElementoDriveACarpeta(auth, "f1", "nuevo");
    const url = request.mock.calls[1]![0].url as string;
    expect(url).toContain("removeParents=otro");
    expect(url).not.toContain("addParents");
  });

  it("un elemento inexistente (404) se informa sin lanzar", async () => {
    const { auth } = cliente({ status: 404, data: {} });
    expect(await moverElementoDriveACarpeta(auth, "f1", "nuevo")).toBe("NO_ENCONTRADO");
  });
});

describe("resolverCarpetaMesZoom", () => {
  it("devuelve AAAA/MM bajo la raíz indicada sin crear la carpeta de la ocurrencia", async () => {
    const asegurar = vi.fn(
      async (_c: string, nombre: string, padre: string) => `${padre}/${nombre}`,
    );
    const mes = await resolverCarpetaMesZoom({ asegurarCarpeta: asegurar }, hash, INICIO, "RAIZ");
    expect(mes).toBe("RAIZ/2026/03");
    expect(asegurar).toHaveBeenCalledTimes(2);
  });
});

describe("renombrarElementoDrive", () => {
  it("cambia el nombre con un PATCH conservando el ID", async () => {
    const { request, auth } = cliente(
      { status: 200, data: { id: "f1", name: "viejo" } },
      { status: 200, data: { id: "f1", name: "20261105 - Tema" } },
    );
    expect(await renombrarElementoDrive(auth, "f1", "20261105 - Tema")).toBe("RENOMBRADA");
    const patch = request.mock.calls[1]![0];
    expect(patch.method).toBe("PATCH");
    expect(patch.url).toContain("/files/f1?");
    expect(patch.data).toEqual({ name: "20261105 - Tema" });
  });

  it("si ya tiene ese nombre no escribe (idempotente)", async () => {
    const { request, auth } = cliente({ status: 200, data: { id: "f1", name: "igual" } });
    expect(await renombrarElementoDrive(auth, "f1", "igual")).toBe("YA_NOMBRADA");
    expect(request).toHaveBeenCalledTimes(1);
  });

  it("un elemento inexistente (404) se informa sin lanzar y un error de Drive sí lanza", async () => {
    expect(await renombrarElementoDrive(cliente({ status: 404, data: {} }).auth, "f1", "x")).toBe(
      "NO_ENCONTRADO",
    );
    await expect(
      renombrarElementoDrive(cliente({ status: 500, data: {} }).auth, "f1", "x"),
    ).rejects.toThrow("HTTP 500");
  });
});
