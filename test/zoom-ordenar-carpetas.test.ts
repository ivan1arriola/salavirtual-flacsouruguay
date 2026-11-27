import { describe, expect, it, vi } from "vitest";
import { ordenarCarpetasVinculadasZoomUseCase } from "../src/modules/archivos/application";

const hash = (t: string) => `h(${t})`;
const AHORA = new Date("2026-11-14T12:00:00Z");

const oc = (id: string, inicio: string, titulo = "Encuentros sincrónicos IAPE") => ({
  ocurrenciaId: id,
  driveFolderId: `f-${id}`,
  inicioRealAt: new Date(inicio),
  titulo,
});

function armar(
  filas: ReturnType<typeof oc>[],
  pendientes: string[],
  opciones: { raiz?: string | null; mover?: (id: string) => Promise<string> } = {},
) {
  const repo = {
    listarPendientes: vi.fn(async () => filas.filter((f) => pendientes.includes(f.ocurrenciaId))),
    listarVinculadasCercanas: vi.fn(async () => filas),
    marcarCarpetaVinculada: vi.fn(async () => true),
  };
  const storage = {
    asegurarCarpeta: vi.fn(
      async (_c: string, nombre: string, padre: string) => `${padre}/${nombre}`,
    ),
    moverCarpeta: vi.fn(async (id: string) => (opciones.mover ? opciones.mover(id) : "MOVIDA")),
    renombrarCarpeta: vi.fn(
      async (_id: string, _nombre: string, _signal?: AbortSignal) => "RENOMBRADA",
    ),
  };
  const deps = {
    repo,
    storage,
    hash,
    raizVinculados: opciones.raiz === undefined ? "RAIZ" : opciones.raiz,
    ahora: () => AHORA,
  };
  return {
    repo,
    storage,
    run: () => ordenarCarpetasVinculadasZoomUseCase(deps as never, { limite: 10 }),
  };
}

describe("ordenarCarpetasVinculadasZoomUseCase", () => {
  it("una sola grabación: la carpeta queda directo en la raíz como 'AAAAMMDD - Tema'", async () => {
    const { storage, repo, run } = armar(
      [oc("o1", "2026-11-10T14:00:00Z", "Curso básico")],
      ["o1"],
    );
    const r = await run();
    expect(storage.renombrarCarpeta).toHaveBeenCalledWith(
      "f-o1",
      "20261110 - Curso básico",
      undefined,
    );
    expect(storage.moverCarpeta).toHaveBeenCalledWith("f-o1", "RAIZ", undefined);
    expect(storage.asegurarCarpeta).not.toHaveBeenCalled();
    expect(repo.marcarCarpetaVinculada).toHaveBeenCalledWith("o1", AHORA);
    expect(r).toMatchObject({ ordenadas: 1, fallidas: 0, sinRaiz: false });
  });

  it("hora local de Montevideo define la fecha del nombre", async () => {
    const { storage, run } = armar([oc("o1", "2026-11-10T02:30:00Z", "Clase")], ["o1"]);
    await run();
    expect(storage.renombrarCarpeta).toHaveBeenCalledWith("f-o1", "20261109 - Clase", undefined);
  });

  it("varias grabaciones del mismo encuentro: subcarpetas 'Grabación N' en orden cronológico dentro de 'AAAAMMDD - Tema'", async () => {
    const filas = [oc("o2", "2026-11-05T20:50:00Z"), oc("o1", "2026-11-05T20:48:00Z")];
    const { storage, repo, run } = armar(filas, ["o2"]);
    const r = await run();
    const nombres = storage.renombrarCarpeta.mock.calls.map((c) => `${c[0]}=${c[1]}`);
    expect(nombres).toEqual(["f-o1=Grabación 1", "f-o2=Grabación 2"]);
    const grupo = "RAIZ/20261105 - Encuentros sincrónicos IAPE";
    expect(storage.asegurarCarpeta).toHaveBeenCalledTimes(1);
    expect(storage.moverCarpeta).toHaveBeenCalledWith("f-o1", grupo, undefined);
    expect(storage.moverCarpeta).toHaveBeenCalledWith("f-o2", grupo, undefined);
    // Renombra todas antes de asegurar la carpeta del encuentro: no se confunde con la carpeta de la primera grabación.
    const ordenRenombrar = storage.renombrarCarpeta.mock.invocationCallOrder.at(-1)!;
    expect(storage.asegurarCarpeta.mock.invocationCallOrder[0]!).toBeGreaterThan(ordenRenombrar);
    expect(repo.marcarCarpetaVinculada).toHaveBeenCalledTimes(2);
    expect(r).toMatchObject({ ordenadas: 2 });
  });

  it("encuentros distintos el mismo día no se mezclan", async () => {
    const filas = [
      oc("o1", "2026-11-05T14:00:00Z", "Taller A"),
      oc("o2", "2026-11-05T15:00:00Z", "Taller B"),
    ];
    const { storage, run } = armar(filas, ["o1", "o2"]);
    await run();
    expect(storage.asegurarCarpeta).not.toHaveBeenCalled();
    expect(storage.renombrarCarpeta).toHaveBeenCalledWith("f-o1", "20261105 - Taller A", undefined);
    expect(storage.renombrarCarpeta).toHaveBeenCalledWith("f-o2", "20261105 - Taller B", undefined);
  });

  it("un grupo se procesa una sola vez aunque varias de sus ocurrencias estén pendientes", async () => {
    const filas = [oc("o1", "2026-11-05T20:48:00Z"), oc("o2", "2026-11-05T20:50:00Z")];
    const { storage, run } = armar(filas, ["o1", "o2"]);
    await run();
    expect(storage.asegurarCarpeta).toHaveBeenCalledTimes(1);
    expect(storage.moverCarpeta).toHaveBeenCalledTimes(2);
  });

  it("un fallo no se marca como resuelto ni oculta el mensaje (puede traer datos sensibles)", async () => {
    const { repo, run } = armar([oc("o1", "2026-11-10T14:00:00Z")], ["o1"], {
      mover: async () => {
        throw new Error("403 secreto");
      },
    });
    const r = await run();
    expect(r).toMatchObject({ ordenadas: 0, fallidas: 1 });
    expect(repo.marcarCarpetaVinculada).not.toHaveBeenCalled();
    expect(JSON.stringify(r)).not.toContain("secreto");
  });

  it("carpeta inexistente en Drive: se cuenta y no se marca", async () => {
    const { repo, run } = armar([oc("o1", "2026-11-10T14:00:00Z")], ["o1"], {
      mover: async () => "NO_ENCONTRADO",
    });
    expect(await run()).toMatchObject({ ordenadas: 0, noEncontradas: 1 });
    expect(repo.marcarCarpetaVinculada).not.toHaveBeenCalled();
  });

  it("sin raíz de vinculados no hay destino seguro: no hace nada", async () => {
    const { repo, storage, run } = armar([oc("o1", "2026-11-10T14:00:00Z")], ["o1"], {
      raiz: null,
    });
    expect(await run()).toMatchObject({ ordenadas: 0, sinRaiz: true });
    expect(storage.moverCarpeta).not.toHaveBeenCalled();
    expect(repo.listarPendientes).not.toHaveBeenCalled();
  });
});
