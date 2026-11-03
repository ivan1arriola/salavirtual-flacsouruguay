import { describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/reuniones/encuentros-persistence.adapter", () => ({
  auditarEncuentro: vi.fn(),
  recalcularSolicitud: vi.fn()
}));
vi.mock("../src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: vi.fn().mockResolvedValue(true)
}));
vi.mock("../src/modules/asistencia/reserva-asistencia.service", () => ({
  reservarAsistenteDisponible: vi.fn()
}));

import {
  actualizarEncuentro,
  agregarEncuentro,
  eliminarEncuentro
} from "../src/modules/reuniones/gestionar-encuentros.service";

const admin = { id: "admin-1", rol: "ADMINISTRACION", activo: true } as never;
const inicio = new Date("2099-05-10T14:00:00-03:00");
const fin = new Date("2099-05-10T16:00:00-03:00");

const eventoZoom = (extra: Record<string, unknown> = {}) => ({
  id: "ev-zoom", proveedorId: "prov-zoom", cuentaProveedorId: "zoom-host-b",
  externalEventId: "serie-1", codigoReunion: null, reunionProveedorId: "reunion-1",
  proveedor: { tipo: "ZOOM" }, ...extra
});

const dbCon = (tx: Record<string, unknown>) =>
  ({ db: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } } as never);

function txAgregar(eventos: unknown[], conflicts: unknown[] = []) {
  return {
    $executeRaw: vi.fn(),
    solicitudSala: {
      findUnique: vi.fn().mockResolvedValue({
        id: "sol-1", timezone: "America/Montevideo", modalidad: "VIRTUAL", descripcion: null,
        docentePrograma: { programaId: "prog-1" },
        instancias: [{
          id: "inst-1", ordinal: 1, estado: "PROGRAMADA", proveedorActivoTipo: "ZOOM",
          inicioProgramadoAt: new Date("2099-05-01T14:00:00-03:00"),
          finProgramadoAt: new Date("2099-05-01T16:00:00-03:00"),
          eventosProveedor: eventos, cohosts: [], cohostEmails: []
        }]
      })
    },
    proveedorReunion: { findUnique: vi.fn().mockResolvedValue({ id: "prov-zoom", tipo: "ZOOM" }) },
    cuentaProveedor: {
      findMany: vi.fn().mockResolvedValue([{ id: "zoom-host-a", prioridad: 1 }, { id: "zoom-host-b", prioridad: 2 }])
    },
    eventoProveedor: {
      findMany: vi.fn().mockResolvedValue(conflicts),
      create: vi.fn().mockResolvedValue({ id: "ev-nuevo" })
    },
    instanciaSala: { create: vi.fn().mockResolvedValue({ id: "inst-2", descripcion: null }) },
    cohostReunion: { createMany: vi.fn() },
    cohostEmailReunion: { createMany: vi.fn() }
  };
}

describe("agregar un encuentro a una serie con reunión compartida", () => {
  it("vincula el evento nuevo a la misma reunión y a la misma sala, aunque haya otra con mejor prioridad", async () => {
    const tx = txAgregar([eventoZoom()]);
    await agregarEncuentro(dbCon(tx), admin, "sol-1", { inicio, fin });
    expect(tx.eventoProveedor.create.mock.calls[0][0].data).toMatchObject({
      proveedorId: "prov-zoom",
      cuentaProveedorId: "zoom-host-b",
      reunionProveedorId: "reunion-1",
      operacionPendiente: "PROVISIONAR"
    });
  });

  it("si la sala de la serie está ocupada en ese horario rechaza y no elige otra sala", async () => {
    const tx = txAgregar([eventoZoom()], [{
      cuentaProveedorId: "zoom-host-b",
      instancia: { inicioProgramadoAt: inicio, finProgramadoAt: fin }
    }]);
    await expect(agregarEncuentro(dbCon(tx), admin, "sol-1", { inicio, fin }))
      .rejects.toThrow("La sala de la serie está ocupada en ese horario.");
    expect(tx.eventoProveedor.create).not.toHaveBeenCalled();
    expect(tx.instanciaSala.create).not.toHaveBeenCalled();
  });

  it("en una serie de Zoom sin reunión compartida mantiene el comportamiento anterior", async () => {
    const tx = txAgregar([eventoZoom({ reunionProveedorId: null, externalEventId: "propia-1" })], [{
      cuentaProveedorId: "zoom-host-b",
      instancia: { inicioProgramadoAt: inicio, finProgramadoAt: fin }
    }]);
    await agregarEncuentro(dbCon(tx), admin, "sol-1", { inicio, fin });
    const data = tx.eventoProveedor.create.mock.calls[0][0].data;
    expect(data.cuentaProveedorId).toBe("zoom-host-a");
    expect(data).not.toHaveProperty("reunionProveedorId");
  });
});

function txEncuentro(evento: Record<string, unknown>) {
  return {
    $executeRaw: vi.fn(),
    instanciaSala: {
      findFirst: vi.fn().mockResolvedValue({
        id: "inst-1", estado: "PROGRAMADA", timezone: "America/Montevideo", proveedorActivoTipo: "ZOOM",
        inicioProgramadoAt: new Date("2099-05-10T10:00:00-03:00"),
        finProgramadoAt: new Date("2099-05-10T12:00:00-03:00"),
        inicioAsistenciaTecnicaAt: null, finAsistenciaTecnicaAt: null, modalidadOverride: null,
        requiereAsistenciaTecnica: false, descripcion: null,
        solicitud: { modalidad: "VIRTUAL", docentePrograma: { programaId: "prog-1" } },
        eventosProveedor: [evento]
      }),
      count: vi.fn().mockResolvedValue(0),
      update: vi.fn()
    },
    cuentaProveedor: { findUnique: vi.fn().mockResolvedValue({ id: "zoom-host-b", prioridad: 1, limiteConcurrente: 5 }) },
    eventoProveedor: { findMany: vi.fn().mockResolvedValue([]), update: vi.fn(), updateMany: vi.fn() },
    asignacionAsistenciaTecnica: { findFirst: vi.fn().mockResolvedValue(null), updateMany: vi.fn() },
    postulacionAsistenciaTecnica: { updateMany: vi.fn() }
  };
}

describe("reprogramar y cancelar encuentros con reunión compartida", () => {
  it("reprogramar un encuentro cuya reunión compartida ya existe no deja ninguna operación pendiente en Zoom", async () => {
    const tx = txEncuentro(eventoZoom());
    const resultado = await actualizarEncuentro(dbCon(tx), admin, "sol-1", "inst-1", { accion: "EDITAR_FECHA", inicio, fin });
    expect(tx.instanciaSala.update).toHaveBeenCalledTimes(1);
    expect(tx.eventoProveedor.update).not.toHaveBeenCalled();
    expect(resultado.eventoProveedorIds).toEqual([]);
  });

  it("si la reunión compartida todavía no tiene ID de Zoom, el evento sigue pendiente de provisionar", async () => {
    const tx = txEncuentro(eventoZoom({ externalEventId: null }));
    await actualizarEncuentro(dbCon(tx), admin, "sol-1", "inst-1", { accion: "EDITAR_FECHA", inicio, fin });
    expect(tx.eventoProveedor.update.mock.calls[0][0]).toMatchObject({
      where: { id: "ev-zoom" }, data: { operacionPendiente: "PROVISIONAR" }
    });
  });

  it("un evento Zoom sin reunión compartida sigue reprogramándose como hoy", async () => {
    const tx = txEncuentro(eventoZoom({ reunionProveedorId: null, externalEventId: "propia-1" }));
    await actualizarEncuentro(dbCon(tx), admin, "sol-1", "inst-1", { accion: "EDITAR_FECHA", inicio, fin });
    expect(tx.eventoProveedor.update.mock.calls[0][0]).toMatchObject({
      where: { id: "ev-zoom" }, data: { operacionPendiente: "REPROGRAMAR" }
    });
  });

  it("cancelar un encuentro marca CANCELAR solo en su propio evento", async () => {
    const tx = txEncuentro(eventoZoom());
    tx.instanciaSala.count.mockResolvedValue(2);
    const resultado = await eliminarEncuentro(dbCon(tx), admin, "sol-1", "inst-1");
    expect(resultado.eventoProveedorIds).toEqual(["ev-zoom"]);
    expect(tx.eventoProveedor.updateMany.mock.calls[0][0]).toMatchObject({
      where: { id: { in: ["ev-zoom"] } },
      data: { operacionPendiente: "CANCELAR" }
    });
  });
});
