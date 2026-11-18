import { describe, expect, it, vi } from "vitest";

const aplicar = vi.hoisted(() => vi.fn(async () => undefined));
vi.mock("../src/modules/archivos/infrastructure/prisma/zoom-ejecucion-instancia", () => ({
  aplicarEjecucionZoomAInstancia: aplicar
}));

import { backfillEjecucionZoom } from "../scripts/backfill-ejecucion-zoom";

const crearDb = () => {
  const tx = {};
  return {
    tx,
    db: {
      ocurrenciaArchivoZoom: {
        findMany: vi.fn(async () => [
          { cuentaZoomId: "c1", uuid: "u1", eventoProveedor: { instanciaSalaId: "i1" } },
          { cuentaZoomId: "c1", uuid: "u2", eventoProveedor: { instanciaSalaId: "i2" } }
        ])
      },
      $transaction: vi.fn(async (fn: (t: unknown) => Promise<unknown>) => fn(tx))
    }
  };
};

describe("backfill de ejecución Zoom", () => {
  it("dry-run cuenta sin escribir", async () => {
    const { db } = crearDb();
    const r = await backfillEjecucionZoom(db as never, false);
    expect(r).toEqual({ candidatas: 2, aplicadas: 0 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("--aplicar aplica el helper por instancia en transacción", async () => {
    const { db, tx } = crearDb();
    const r = await backfillEjecucionZoom(db as never, true);
    expect(r).toEqual({ candidatas: 2, aplicadas: 2 });
    expect(aplicar).toHaveBeenCalledWith(tx, { instanciaSalaId: "i1", cuentaZoomId: "c1", uuid: "u1" });
  });
});
