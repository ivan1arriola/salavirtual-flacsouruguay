import { describe, expect, it, vi } from "vitest";
import type { Prisma } from "@prisma/client";
import { vincularAutomaticamenteSiInequivoco } from "../src/modules/archivos/infrastructure/prisma/zoom-vinculo-automatico";

type EventoCand = { id: string; instancia?: { inicioProgramadoAt: Date; finProgramadoAt: Date } };
/** `eventos` = respuesta del 1.º findMany (UUID); `luego` = respuesta del 2.º (reunión + horario). */
function txFalso(eventos: EventoCand[], actualizados = 1, luego: EventoCand[] = []) {
  const findMany = vi.fn(async (_args?: unknown) => eventos);
  findMany.mockResolvedValueOnce(eventos).mockResolvedValue(luego);
  return {
    eventoProveedor: { findMany },
    ocurrenciaArchivoZoom: { updateMany: vi.fn(async () => ({ count: actualizados })) },
    auditoria: { create: vi.fn(async (_a: { data: Record<string, unknown> }) => ({})) }
  };
}
const AHORA = new Date("2026-11-11T12:00:00Z");
const REAL = new Date("2026-11-09T14:05:00Z");
const MIN = 60_000;
const inst = (inicioMin: number, finMin: number) => ({
  inicioProgramadoAt: new Date(REAL.getTime() + inicioMin * MIN),
  finProgramadoAt: new Date(REAL.getTime() + finMin * MIN)
});
const correr = (tx: ReturnType<typeof txFalso>, over: Partial<{ eventoProveedorId: string | null }> = {}) =>
  vincularAutomaticamenteSiInequivoco(tx as unknown as Prisma.TransactionClient, {
    ocurrenciaId: "o1",
    uuid: "uuid-1",
    meetingId: "888",
    inicioRealAt: REAL,
    eventoProveedorId: null,
    ahora: AHORA,
    ...over
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
    expect(tx.auditoria.create.mock.calls[0]![0].data).toMatchObject({
      accion: "ZOOM_OCURRENCIA_VINCULADA_AUTO",
      entidadId: "o1",
      actorUsuarioId: null
    });
  });

  it("busca solo por UUID exacto y en proveedores Zoom, pidiendo a lo sumo 2 para detectar la ambigüedad", async () => {
    const tx = txFalso([]);
    await correr(tx);
    expect(tx.eventoProveedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { zoomMeetingUuid: "uuid-1", proveedor: { tipo: { in: ["ZOOM", "ZOOM_HISTORICO"] } } },
        take: 2
      })
    );
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

describe("vínculo automático por reunión y horario (cuando no hay UUID)", () => {
  it("un único encuentro de esa reunión cuyo horario contiene el inicio real: vincula con criterio REUNION_Y_HORARIO", async () => {
    const tx = txFalso([], 1, [{ id: "ev9", instancia: inst(-5, 55) }]);
    expect(await correr(tx)).toEqual({ tipo: "VINCULADA", eventoProveedorId: "ev9" });
    expect(tx.auditoria.create.mock.calls[0]![0].data).toMatchObject({
      valorNuevo: { eventoProveedorId: "ev9", criterio: "REUNION_Y_HORARIO" }
    });
  });

  it("consulta por número de reunión, proveedores Zoom y horario que abarque el inicio real (con 45 min de tolerancia previa)", async () => {
    const tx = txFalso([], 1, []);
    await correr(tx);
    const arg = tx.eventoProveedor.findMany.mock.calls[1]![0] as {
      where: Record<string, unknown>;
      take: number;
    };
    expect(arg.where).toMatchObject({
      externalEventId: "888",
      proveedor: { tipo: { in: ["ZOOM", "ZOOM_HISTORICO"] } },
      instancia: {
        inicioProgramadoAt: { lte: new Date(REAL.getTime() + 45 * MIN) },
        finProgramadoAt: { gte: REAL }
      }
    });
    expect(arg.take).toBe(5);
  });

  it("dos encuentros que contienen el inicio real son ambiguos: no se vincula", async () => {
    const tx = txFalso([], 1, [
      { id: "a", instancia: inst(-10, 50) },
      { id: "b", instancia: inst(-20, 40) }
    ]);
    expect(await correr(tx)).toEqual({ tipo: "AMBIGUA" });
    expect(tx.ocurrenciaArchivoZoom.updateMany).not.toHaveBeenCalled();
  });

  it("si ninguno contiene el inicio pero uno empieza dentro de la tolerancia previa (inicio anticipado), vincula ese", async () => {
    const tx = txFalso([], 1, [{ id: "temprano", instancia: inst(20, 80) }]);
    expect(await correr(tx)).toEqual({ tipo: "VINCULADA", eventoProveedorId: "temprano" });
  });

  it("dos candidatos solo por tolerancia previa también son ambiguos", async () => {
    const tx = txFalso([], 1, [
      { id: "a", instancia: inst(10, 70) },
      { id: "b", instancia: inst(30, 90) }
    ]);
    expect(await correr(tx)).toEqual({ tipo: "AMBIGUA" });
  });

  it("un encuentro que contiene el inicio gana sobre otro que solo está en tolerancia", async () => {
    const tx = txFalso([], 1, [
      { id: "contiene", instancia: inst(-5, 55) },
      { id: "temprano", instancia: inst(30, 90) }
    ]);
    expect(await correr(tx)).toEqual({ tipo: "VINCULADA", eventoProveedorId: "contiene" });
  });

  it("si el UUID ya fue ambiguo no se intenta adivinar por horario", async () => {
    const tx = txFalso([{ id: "x1" }, { id: "x2" }], 1, [{ id: "ev9", instancia: inst(-5, 55) }]);
    expect(await correr(tx)).toEqual({ tipo: "AMBIGUA" });
    expect(tx.eventoProveedor.findMany).toHaveBeenCalledTimes(1);
  });

  it("sin candidatos por reunión y horario queda pendiente de vínculo manual", async () => {
    const tx = txFalso([], 1, []);
    expect(await correr(tx)).toEqual({ tipo: "SIN_COINCIDENCIA" });
  });
});
