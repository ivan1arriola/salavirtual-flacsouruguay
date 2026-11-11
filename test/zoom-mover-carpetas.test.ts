import { describe, expect, it, vi } from "vitest";
import type { JWT } from "google-auth-library";
import { moverElementoDriveACarpeta } from "../src/integrations/google/drive/drive-files.client";
import {
  moverCarpetasVinculadasZoomUseCase,
  resolverCarpetaMesZoom
} from "../src/modules/archivos/application";

const hash = (t: string) => `h(${t})`;
const INICIO = new Date("2026-03-15T14:00:00Z");

function cliente(...respuestas: Array<Record<string, unknown>>) {
  const request = vi.fn();
  for (const r of respuestas) request.mockResolvedValueOnce(r);
  return { request, auth: { request } as unknown as JWT };
}

describe("moverElementoDriveACarpeta", () => {
  it("quita los padres actuales y agrega el nuevo en un solo PATCH, conservando el ID", async () => {
    const { request, auth } = cliente(
      { status: 200, data: { id: "f1", parents: ["viejo"] } },
      { status: 200, data: { id: "f1", parents: ["nuevo"] } }
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
      { status: 200, data: { id: "f1", parents: ["nuevo"] } }
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
    const asegurar = vi.fn(async (_c: string, nombre: string, padre: string) => `${padre}/${nombre}`);
    const mes = await resolverCarpetaMesZoom({ asegurarCarpeta: asegurar }, hash, INICIO, "RAIZ");
    expect(mes).toBe("RAIZ/2026/03");
    expect(asegurar).toHaveBeenCalledTimes(2);
  });
});

describe("moverCarpetasVinculadasZoomUseCase", () => {
  const ocurrencia = (id: string, carpeta = `carpeta-${id}`) => ({
    ocurrenciaId: id, driveFolderId: carpeta,
    referencia: { cuentaZoomId: "c", uuid: `u-${id}`, meetingId: "m", anfitrionZoomId: "h", inicioRealAt: INICIO, titulo: "Clase" }
  });

  function armar(pendientes: ReturnType<typeof ocurrencia>[], opciones: { mover?: (id: string) => Promise<string>; raiz?: string | null } = {}) {
    const repo = {
      listarCarpetasPorMover: vi.fn(async () => pendientes),
      marcarCarpetaVinculada: vi.fn(async () => true)
    };
    const storage = {
      asegurarCarpeta: vi.fn(async (_c: string, nombre: string, padre: string) => `${padre}/${nombre}`),
      moverCarpeta: vi.fn(async (id: string) => (opciones.mover ? opciones.mover(id) : "MOVIDA"))
    };
    const deps = { repo, storage, hash, raizVinculados: opciones.raiz === undefined ? "VINCULADOS" : opciones.raiz, ahora: () => new Date("2026-11-11T12:00:00Z") };
    return { repo, storage, run: () => moverCarpetasVinculadasZoomUseCase(deps as never, { limite: 10 }) };
  }

  it("mueve la carpeta de la ocurrencia al AAAA/MM de la raíz de VINCULADOS (nunca la histórica) y la marca", async () => {
    const { repo, storage, run } = armar([ocurrencia("o1")]);
    const r = await run();
    expect(r).toMatchObject({ movidas: 1, yaEnDestino: 0, fallidas: 0 });
    expect(storage.moverCarpeta).toHaveBeenCalledWith("carpeta-o1", "VINCULADOS/2026/03", undefined);
    expect(repo.marcarCarpetaVinculada).toHaveBeenCalledWith("o1", new Date("2026-11-11T12:00:00Z"));
  });

  it("una carpeta que ya está en destino también se marca como resuelta", async () => {
    const { repo, run } = armar([ocurrencia("o1")], { mover: async () => "YA_EN_DESTINO" });
    expect(await run()).toMatchObject({ movidas: 0, yaEnDestino: 1 });
    expect(repo.marcarCarpetaVinculada).toHaveBeenCalledTimes(1);
  });

  it("un fallo en una carpeta no impide las demás ni se marca como resuelta", async () => {
    const { repo, run } = armar([ocurrencia("o1"), ocurrencia("o2")], {
      mover: async (id) => { if (id === "carpeta-o1") throw new Error("403 secreto"); return "MOVIDA"; }
    });
    const r = await run();
    expect(r).toMatchObject({ movidas: 1, fallidas: 1 });
    expect(repo.marcarCarpetaVinculada).toHaveBeenCalledTimes(1);
    expect(repo.marcarCarpetaVinculada).toHaveBeenCalledWith("o2", expect.any(Date));
    expect(JSON.stringify(r)).not.toContain("secreto");
  });

  it("sin carpeta raíz de vinculados no hay destino válido: no mueve ni marca nada", async () => {
    const { repo, storage, run } = armar([ocurrencia("o1")], { raiz: null });
    expect(await run()).toMatchObject({ movidas: 0, sinRaiz: true });
    expect(storage.moverCarpeta).not.toHaveBeenCalled();
    expect(repo.marcarCarpetaVinculada).not.toHaveBeenCalled();
    expect(repo.listarCarpetasPorMover).not.toHaveBeenCalled();
  });

  it("un elemento que ya no existe en Drive se cuenta aparte y no se marca (se reintentará o revisará)", async () => {
    const { repo, run } = armar([ocurrencia("o1")], { mover: async () => "NO_ENCONTRADO" });
    expect(await run()).toMatchObject({ noEncontradas: 1, movidas: 0 });
    expect(repo.marcarCarpetaVinculada).not.toHaveBeenCalled();
  });
});
