import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  updateMany: vi.fn(),
  upsert: vi.fn(),
  findFirst: vi.fn(),
  findUnique: vi.fn(),
  updateInstance: vi.fn(),
  vincular: vi.fn()
}));
vi.mock("../src/lib/db", () => ({
  db: {
    eventoWebhookZoom: { findMany: mocks.findMany, updateMany: mocks.updateMany },
    $transaction: (fn: (tx: unknown) => Promise<unknown>) =>
      fn({
        cuentaProveedor: { findFirst: mocks.findFirst },
        ocurrenciaArchivoZoom: { upsert: mocks.upsert },
        eventoProveedor: { findUnique: mocks.findUnique },
        instanciaSala: { updateMany: mocks.updateInstance }
      })
  }
}));
vi.mock("../src/modules/archivos/infrastructure/prisma/zoom-vinculo-automatico", () => ({
  vincularAutomaticamenteSiInequivoco: mocks.vincular
}));

import { procesarWebhooksZoom } from "../src/bootstrap/zoom-webhook-worker";

const aviso = {
  id: "w1",
  tipo: "meeting.ended",
  cuentaZoomId: "cuenta-1",
  meetingId: "123456789",
  uuid: "uuid-1",
  anfitrionZoomId: "host-1",
  inicioRealAt: new Date("2026-11-13T10:00:00Z"),
  finRealAt: new Date("2026-11-13T11:00:00Z"),
  titulo: "Clase",
  intentos: 0
};

beforeEach(() => {
  for (const mock of Object.values(mocks)) {
    mock.mockReset();
  }
  mocks.findMany.mockResolvedValueOnce([aviso]).mockResolvedValue([]);
  mocks.updateMany.mockResolvedValue({ count: 1 });
  mocks.findFirst.mockResolvedValue({ id: "sala-1" });
  mocks.upsert.mockResolvedValue({ id: "ocurrencia-1", eventoProveedorId: null });
  mocks.vincular.mockResolvedValue({ tipo: "VINCULADA", eventoProveedorId: "evento-1" });
  mocks.findUnique.mockResolvedValue({ instanciaSalaId: "instancia-1" });
  mocks.updateInstance.mockResolvedValue({ count: 1 });
});

describe("procesar bandeja Zoom", () => {
  it("crea la ocurrencia por UUID y finaliza solo la instancia vinculada", async () => {
    expect(await procesarWebhooksZoom("cuenta-1", 2)).toEqual({ procesados: 1, ignorados: 0, errores: 0 });
    expect(mocks.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { cuentaZoomId_uuid: { cuentaZoomId: "cuenta-1", uuid: "uuid-1" } }
      })
    );
    expect(mocks.upsert.mock.calls[0]?.[0].create).not.toHaveProperty("estadoAsistencia");
    expect(mocks.updateInstance).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "instancia-1", estado: { in: ["PROGRAMADA", "EN_CURSO"] } },
        data: expect.objectContaining({ estado: "FINALIZADA" })
      })
    );
  });

  it("no atribuye un aviso ambiguo y adelanta el inventario si hay grabación", async () => {
    mocks.findMany
      .mockReset()
      .mockResolvedValueOnce([{ ...aviso, tipo: "recording.completed" }])
      .mockResolvedValue([]);
    mocks.vincular.mockResolvedValue({ tipo: "AMBIGUA" });
    expect(await procesarWebhooksZoom("cuenta-1", 2)).toMatchObject({ procesados: 1 });
    expect(mocks.upsert.mock.calls[0]?.[0]).toMatchObject({
      create: { proximoInventarioAt: expect.any(Date) },
      update: { proximoInventarioAt: expect.any(Date) }
    });
    expect(mocks.updateInstance).not.toHaveBeenCalled();
  });

  it("ignora otras cuentas sin modificar las ocurrencias", async () => {
    expect(await procesarWebhooksZoom("cuenta-ajena", 1)).toMatchObject({ ignorados: 1 });
    expect(mocks.upsert).not.toHaveBeenCalled();
  });
});

describe("asistencia al finalizar la reunión", () => {
  const disponible = { tipo: "OK", estadoReporte: "DISPONIBLE", participantes: 3, sesionesNuevas: 3 } as const;
  const datosDelAviso = () => mocks.updateMany.mock.calls.at(-1)?.[0].data;

  it("meeting.ended sincroniza la ocurrencia y marca el aviso procesado", async () => {
    const sync = vi.fn().mockResolvedValue(disponible);
    expect(await procesarWebhooksZoom("cuenta-1", 2, sync)).toEqual({ procesados: 1, ignorados: 0, errores: 0 });
    expect(sync).toHaveBeenCalledTimes(1);
    expect(sync).toHaveBeenCalledWith("ocurrencia-1");
  });

  it("meeting.started no sincroniza", async () => {
    mocks.findMany.mockReset().mockResolvedValueOnce([{ ...aviso, tipo: "meeting.started" }]).mockResolvedValue([]);
    const sync = vi.fn();
    await procesarWebhooksZoom("cuenta-1", 2, sync);
    expect(sync).not.toHaveBeenCalled();
  });

  it("otra cuenta se ignora sin llamar a Zoom", async () => {
    const sync = vi.fn();
    expect(await procesarWebhooksZoom("cuenta-ajena", 1, sync)).toMatchObject({ ignorados: 1 });
    expect(sync).not.toHaveBeenCalled();
  });

  it("un 404 de Zoom deja el aviso en ERROR reintentable", async () => {
    const sync = vi.fn().mockResolvedValue({ tipo: "PENDIENTE", estadoReporte: "NO_DISPONIBLE" });
    expect(await procesarWebhooksZoom("cuenta-1", 2, sync)).toMatchObject({ procesados: 0, errores: 1 });
    expect(datosDelAviso()).toMatchObject({
      estado: "ERROR",
      errorCodigo: "ReporteZoomPendiente",
      proximoIntentoAt: expect.any(Date)
    });
  });

  it("un 404 en el último intento deja el aviso FALLIDO", async () => {
    mocks.findMany.mockReset().mockResolvedValueOnce([{ ...aviso, intentos: 9 }]).mockResolvedValue([]);
    const sync = vi.fn().mockResolvedValue({ tipo: "PENDIENTE", estadoReporte: "NO_DISPONIBLE" });
    await procesarWebhooksZoom("cuenta-1", 2, sync);
    expect(datosDelAviso()).toMatchObject({ estado: "FALLIDO" });
  });

  it("un conflicto por reprogramación cuenta como procesado", async () => {
    const sync = vi.fn().mockResolvedValue({ tipo: "CONFLICTO", motivo: "REPROGRAMADO" });
    expect(await procesarWebhooksZoom("cuenta-1", 2, sync)).toMatchObject({ procesados: 1, errores: 0 });
  });

  it("el error de la sincronización conserva su código", async () => {
    const sync = vi.fn().mockResolvedValue({ tipo: "ERROR", codigo: "ZOOM_NO_CONFIGURADO" });
    expect(await procesarWebhooksZoom("cuenta-1", 2, sync)).toMatchObject({ errores: 1 });
    expect(datosDelAviso()).toMatchObject({ estado: "ERROR", errorCodigo: "ZOOM_NO_CONFIGURADO" });
  });

  it("una excepción inesperada no detiene el ciclo", async () => {
    const sync = vi.fn().mockRejectedValue(new Error("boom"));
    expect(await procesarWebhooksZoom("cuenta-1", 2, sync)).toMatchObject({ errores: 1 });
    expect(datosDelAviso()).toMatchObject({ estado: "ERROR", errorCodigo: "Error" });
  });

  it("sin función de sincronización se comporta como antes", async () => {
    expect(await procesarWebhooksZoom("cuenta-1", 2)).toEqual({ procesados: 1, ignorados: 0, errores: 0 });
  });
});
