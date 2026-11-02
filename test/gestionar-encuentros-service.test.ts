import { describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/reuniones/encuentros-persistence.adapter", () => ({
  auditarEncuentro: vi.fn(),
  recalcularSolicitud: vi.fn(),
}));
vi.mock("../src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: vi.fn().mockResolvedValue(true),
}));
vi.mock("../src/modules/asistencia/reserva-asistencia.service", () => ({
  reservarAsistenteDisponible: vi.fn(),
}));

import {
  actualizarEncuentro,
  agregarEncuentro,
  eliminarEncuentro,
} from "../src/modules/reuniones/gestionar-encuentros.service";

const actor = { id: "admin-1", rol: "ADMINISTRACION", activo: true } as never;
const inicio = new Date("2099-05-10T14:00:00-03:00");
const fin = new Date("2099-05-10T16:00:00-03:00");

const meetEvento = {
  id: "ev-meet",
  proveedorId: "prov-meet",
  cuentaProveedorId: "meet-host",
  externalEventId: "meet-ext",
  codigoReunion: "abc-defg-hij",
  proveedor: { tipo: "GOOGLE_MEET" },
};
const zoomEvento = {
  id: "ev-zoom",
  proveedorId: "prov-zoom",
  cuentaProveedorId: "zoom-host-a",
  externalEventId: "zoom-ext",
  codigoReunion: null,
  proveedor: { tipo: "ZOOM" },
};

function dbCon(tx: Record<string, unknown>) {
  return { db: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } } as never;
}

describe("agregarEncuentro - sin nuevos Meet", () => {
  function crearTx(conflicts: unknown[] = []) {
    const tx = {
      $executeRaw: vi.fn(),
      solicitudSala: {
        findUnique: vi.fn().mockResolvedValue({
          id: "sol-1",
          timezone: "America/Montevideo",
          modalidad: "VIRTUAL",
          descripcion: null,
          docentePrograma: { programaId: "prog-1" },
          instancias: [{
            id: "inst-1",
            ordinal: 1,
            estado: "PROGRAMADA",
            inicioProgramadoAt: new Date("2099-05-01T14:00:00-03:00"),
            finProgramadoAt: new Date("2099-05-01T16:00:00-03:00"),
            eventosProveedor: [meetEvento],
            cohosts: [],
            cohostEmails: [],
          }],
        }),
      },
      proveedorReunion: { findUnique: vi.fn().mockResolvedValue({ id: "prov-zoom", tipo: "ZOOM" }) },
      cuentaProveedor: {
        findMany: vi.fn().mockResolvedValue([
          { id: "zoom-host-a", prioridad: 1 },
          { id: "zoom-host-b", prioridad: 2 },
        ]),
      },
      eventoProveedor: {
        findMany: vi.fn().mockResolvedValue(conflicts),
        create: vi.fn().mockResolvedValue({ id: "ev-nuevo" }),
      },
      instanciaSala: { create: vi.fn().mockResolvedValue({ id: "inst-2", descripcion: null }) },
      cohostReunion: { createMany: vi.fn() },
      cohostEmailReunion: { createMany: vi.fn() },
    };
    return tx;
  }

  it("agrega con Zoom activo aunque la serie sea Meet legada", async () => {
    const tx = crearTx();
    await agregarEncuentro(dbCon(tx), actor, "sol-1", { inicio, fin });

    expect(tx.proveedorReunion.findUnique).toHaveBeenCalledWith({ where: { tipo: "ZOOM" } });
    expect(tx.instanciaSala.create.mock.calls[0][0].data.proveedorActivoTipo).toBe("ZOOM");
    expect(tx.eventoProveedor.create.mock.calls[0][0].data).toMatchObject({
      proveedorId: "prov-zoom",
      cuentaProveedorId: "zoom-host-a",
      operacionPendiente: "PROVISIONAR",
    });
  });

  it("usa capacidad 1 y cuenta EN_CURSO para elegir host", async () => {
    const tx = crearTx([{
      cuentaProveedorId: "zoom-host-a",
      instancia: { inicioProgramadoAt: inicio, finProgramadoAt: fin },
    }]);
    await agregarEncuentro(dbCon(tx), actor, "sol-1", { inicio, fin });

    expect(tx.eventoProveedor.findMany.mock.calls[0][0].where.instancia.estado)
      .toEqual({ in: ["PROGRAMADA", "EN_CURSO"] });
    expect(tx.eventoProveedor.create.mock.calls[0][0].data.cuentaProveedorId).toBe("zoom-host-b");
  });

  it("falla si ningún host Zoom está libre", async () => {
    const ocupado = (id: string) => ({
      cuentaProveedorId: id,
      instancia: { inicioProgramadoAt: inicio, finProgramadoAt: fin },
    });
    const tx = crearTx([ocupado("zoom-host-a"), ocupado("zoom-host-b")]);
    await expect(agregarEncuentro(dbCon(tx), actor, "sol-1", { inicio, fin }))
      .rejects.toThrow("No hay un host Zoom libre");
    expect(tx.eventoProveedor.create).not.toHaveBeenCalled();
  });
});

describe("encuentro migrado con Meet histórico y Zoom activo", () => {
  function crearTx() {
    return {
      $executeRaw: vi.fn(),
      instanciaSala: {
        findFirst: vi.fn().mockResolvedValue({
          id: "inst-1",
          estado: "PROGRAMADA",
          timezone: "America/Montevideo",
          proveedorActivoTipo: "ZOOM",
          inicioProgramadoAt: new Date("2099-05-10T10:00:00-03:00"),
          finProgramadoAt: new Date("2099-05-10T12:00:00-03:00"),
          inicioAsistenciaTecnicaAt: null,
          finAsistenciaTecnicaAt: null,
          modalidadOverride: null,
          requiereAsistenciaTecnica: false,
          descripcion: null,
          solicitud: { modalidad: "VIRTUAL", docentePrograma: { programaId: "prog-1" } },
          // Meet primero, para detectar selección por orden.
          eventosProveedor: [meetEvento, zoomEvento],
        }),
        count: vi.fn().mockResolvedValue(0),
        update: vi.fn(),
      },
      cuentaProveedor: {
        findUnique: vi.fn().mockResolvedValue({ id: "zoom-host-a", prioridad: 1, limiteConcurrente: 5 }),
      },
      eventoProveedor: {
        findMany: vi.fn().mockResolvedValue([]),
        update: vi.fn(),
        updateMany: vi.fn(),
      },
      asignacionAsistenciaTecnica: {
        findFirst: vi.fn().mockResolvedValue(null),
        updateMany: vi.fn(),
      },
      postulacionAsistenciaTecnica: { updateMany: vi.fn() },
    };
  }

  it("reprograma el evento Zoom y no toca Meet; capacidad incluye EN_CURSO", async () => {
    const tx = crearTx();
    const res = await actualizarEncuentro(dbCon(tx), actor, "sol-1", "inst-1", {
      accion: "EDITAR_FECHA", inicio, fin,
    });

    expect(res.eventoProveedorIds).toEqual(["ev-zoom"]);
    expect(tx.eventoProveedor.update).toHaveBeenCalledTimes(1);
    expect(tx.eventoProveedor.update.mock.calls[0][0]).toMatchObject({
      where: { id: "ev-zoom" },
      data: { operacionPendiente: "REPROGRAMAR" },
    });
    expect(tx.eventoProveedor.findMany.mock.calls[0][0].where.cuentaProveedorId).toBe("zoom-host-a");
    expect(tx.eventoProveedor.findMany.mock.calls[0][0].where.instancia.estado)
      .toEqual({ in: ["PROGRAMADA", "EN_CURSO"] });
    expect(tx.instanciaSala.count.mock.calls[0][0].where.estado)
      .toEqual({ in: ["PROGRAMADA", "EN_CURSO"] });
  });

  it("rechaza reprogramar si el host Zoom (capacidad 1) está ocupado por un EN_CURSO", async () => {
    const tx = crearTx();
    tx.eventoProveedor.findMany.mockResolvedValue([{
      cuentaProveedorId: "zoom-host-a",
      instancia: { inicioProgramadoAt: inicio, finProgramadoAt: fin },
    }]);
    await expect(actualizarEncuentro(dbCon(tx), actor, "sol-1", "inst-1", {
      accion: "EDITAR_FECHA", inicio, fin,
    })).rejects.toThrow("límite");
    expect(tx.eventoProveedor.update).not.toHaveBeenCalled();
  });

  it("cambio de asistencia opera sobre el evento Zoom", async () => {
    const tx = crearTx();
    const res = await actualizarEncuentro(dbCon(tx), actor, "sol-1", "inst-1", {
      accion: "CAMBIAR_ASISTENCIA", requiereAsistenciaTecnica: false,
    });

    expect(res.eventoProveedorIds).toEqual(["ev-zoom"]);
    expect(tx.eventoProveedor.update.mock.calls.map(([arg]) => arg.where.id)).toEqual(["ev-zoom"]);
  });

  it("cancelar el encuentro encola solo Zoom y preserva Meet", async () => {
    const tx = crearTx();
    tx.instanciaSala.count.mockResolvedValue(2);
    const res = await eliminarEncuentro(dbCon(tx), actor, "sol-1", "inst-1");

    expect(res.eventoProveedorIds).toEqual(["ev-zoom"]);
    expect(tx.eventoProveedor.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["ev-zoom"] } },
      data: { operacionPendiente: "CANCELAR" },
    });
  });
});
