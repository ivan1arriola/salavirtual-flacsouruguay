import { describe, expect, it, vi } from "vitest";
import { aplicarEjecucionZoomAInstancia } from "../src/modules/archivos/infrastructure/prisma/zoom-ejecucion-instancia";

const inicio = new Date("2026-11-13T10:00:00Z");
const fin = new Date("2026-11-13T11:00:00Z");
const entrada = { instanciaSalaId: "i1", cuentaZoomId: "c1", uuid: "u1" };

function tx(avisos: unknown[]) {
  const updateMany = vi.fn().mockResolvedValue({ count: 1 });
  return {
    updateMany,
    cliente: {
      eventoWebhookZoom: { findMany: vi.fn().mockResolvedValue(avisos) },
      instanciaSala: { updateMany }
    } as never
  };
}

describe("aplicarEjecucionZoomAInstancia", () => {
  it("sin avisos no toca la instancia", async () => {
    const { updateMany, cliente } = tx([]);
    await aplicarEjecucionZoomAInstancia(cliente, entrada);
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("solo started: pasa a EN_CURSO sin inventar fin", async () => {
    const { updateMany, cliente } = tx([{ tipo: "meeting.started", inicioRealAt: inicio, finRealAt: null }]);
    await aplicarEjecucionZoomAInstancia(cliente, entrada);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "i1", estado: "PROGRAMADA" },
      data: { estado: "EN_CURSO" }
    });
    expect(updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { finRealAt: fin } }));
  });

  it("ended llegado antes que started (fuera de orden) finaliza con las marcas oficiales", async () => {
    const { updateMany, cliente } = tx([{ tipo: "meeting.ended", inicioRealAt: inicio, finRealAt: fin }]);
    await aplicarEjecucionZoomAInstancia(cliente, entrada);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "i1", finRealAt: null },
      data: { finRealAt: fin }
    });
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "i1", estado: { in: ["PROGRAMADA", "EN_CURSO"] } },
      data: { estado: "FINALIZADA" }
    });
  });
});
