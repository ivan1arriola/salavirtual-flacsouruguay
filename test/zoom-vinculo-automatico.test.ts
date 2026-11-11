import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { vincularAutomaticamenteSiInequivoco } from "../src/modules/archivos/infrastructure/prisma/zoom-vinculo-automatico";

function txFalso(eventos: Array<{ id: string }>, actualizados = 1) {
  return {
    eventoProveedor: { findMany: vi.fn(async () => eventos) },
    ocurrenciaArchivoZoom: { updateMany: vi.fn(async () => ({ count: actualizados })) },
    auditoria: { create: vi.fn(async (_a: { data: Record<string, unknown> }) => ({})) }
  };
}
const AHORA = new Date("2026-11-11T12:00:00Z");
const correr = (tx: ReturnType<typeof txFalso>, over: Partial<{ eventoProveedorId: string | null }> = {}) =>
  vincularAutomaticamenteSiInequivoco(tx as unknown as Prisma.TransactionClient, {
    ocurrenciaId: "o1", uuid: "uuid-1", eventoProveedorId: null, ahora: AHORA, ...over
  });

describe("vincularAutomaticamenteSiInequivoco", () => {
  it("un único encuentro Zoom con ese UUID exacto: vincula sin usuario y deja auditoría", async () => {
    const tx = txFalso([{ id: "ev1" }]);
    expect(await correr(tx)).toEqual({ tipo: "VINCULADA", eventoProveedorId: "ev1" });
    expect(tx.ocurrenciaArchivoZoom.updateMany).toHaveBeenCalledWith({
      where: { id: "o1", eventoProveedorId: null },
      data: { eventoProveedorId: "ev1", vinculadaAt: AHORA, vinculadaPorId: null }
    });
    expect(tx.auditoria.create).toHaveBeenCalledTimes(1);
    expect(tx.auditoria.create.mock.calls[0]![0].data).toMatchObject({ accion: "ZOOM_OCURRENCIA_VINCULADA_AUTO", entidadId: "o1", actorUsuarioId: null });
  });

  it("busca solo por UUID exacto y en proveedores Zoom, pidiendo a lo sumo 2 para detectar la ambigüedad", async () => {
    const tx = txFalso([]);
    await correr(tx);
    expect(tx.eventoProveedor.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { zoomMeetingUuid: "uuid-1", proveedor: { tipo: { in: ["ZOOM", "ZOOM_HISTORICO"] } } },
      take: 2
    }));
  });

  it("varios encuentros con el mismo UUID es ambiguo: no vincula nada", async () => {
    const tx = txFalso([{ id: "ev1" }, { id: "ev2" }]);
    expect(await correr(tx)).toEqual({ tipo: "AMBIGUA" });
    expect(tx.ocurrenciaArchivoZoom.updateMany).not.toHaveBeenCalled();
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });

  it("sin coincidencia queda pendiente de vínculo manual", async () => {
    const tx = txFalso([]);
    expect(await correr(tx)).toEqual({ tipo: "SIN_COINCIDENCIA" });
    expect(tx.ocurrenciaArchivoZoom.updateMany).not.toHaveBeenCalled();
  });

  it("una ocurrencia ya vinculada no se toca ni se consulta", async () => {
    const tx = txFalso([{ id: "ev1" }]);
    expect(await correr(tx, { eventoProveedorId: "otro" })).toEqual({ tipo: "YA_VINCULADA" });
    expect(tx.eventoProveedor.findMany).not.toHaveBeenCalled();
  });

  it("si otra operación la vinculó entre medias (0 filas) no audita ni pisa el vínculo", async () => {
    const tx = txFalso([{ id: "ev1" }], 0);
    expect(await correr(tx)).toEqual({ tipo: "YA_VINCULADA" });
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });
});
