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
  eliminarReunionCompleta,
} from "../src/modules/reuniones/gestionar-encuentros.service";

const titular = { id: "titular", rol: "DOCENTE", activo: true } as never;
const otroDocente = { id: "otro", rol: "DOCENTE", activo: true } as never;
const admin = { id: "admin", rol: "ADMINISTRACION", activo: true } as never;
const inicio = new Date("2099-05-10T14:00:00-03:00");
const fin = new Date("2099-05-10T16:00:00-03:00");

const docentePrograma = { programaId: "prog-1", docente: { usuarioId: "titular" } };
const zoomEvento = {
  id: "ev-zoom",
  proveedorId: "prov-zoom",
  cuentaProveedorId: "host",
  externalEventId: "z1",
  codigoReunion: null,
  proveedor: { tipo: "ZOOM" },
};

function dbCon(tx: Record<string, unknown>) {
  return { db: { $transaction: (fn: (t: unknown) => unknown) => fn(tx) } } as never;
}

function txEncuentro() {
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
        solicitud: { modalidad: "VIRTUAL", docentePrograma },
        eventosProveedor: [zoomEvento],
      }),
      count: vi.fn().mockResolvedValue(2),
      update: vi.fn(),
    },
    eventoProveedor: {
      findMany: vi.fn().mockResolvedValue([]),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    cuentaProveedor: {
      findUnique: vi.fn().mockResolvedValue({ id: "host", prioridad: 1, limiteConcurrente: 5 }),
    },
    asignacionAsistenciaTecnica: {
      findFirst: vi.fn().mockResolvedValue(null),
      updateMany: vi.fn(),
    },
    postulacionAsistenciaTecnica: { updateMany: vi.fn() },
    auditoria: { create: vi.fn() },
  };
}

function txSolicitud() {
  return {
    $executeRaw: vi.fn(),
    solicitudSala: {
      findUnique: vi.fn().mockResolvedValue({
        id: "sol-1",
        estado: "PROGRAMADA",
        timezone: "America/Montevideo",
        modalidad: "VIRTUAL",
        descripcion: null,
        docentePrograma,
        instancias: [],
      }),
      update: vi.fn(),
    },
    instanciaSala: { updateMany: vi.fn() },
    eventoProveedor: { updateMany: vi.fn() },
    auditoria: { create: vi.fn() },
  };
}

describe("solo el titular de la reunión (o administración) puede modificarla", () => {
  it("otro docente del programa no puede reprogramar un encuentro", async () => {
    const tx = txEncuentro();
    await expect(
      actualizarEncuentro(dbCon(tx), otroDocente, "sol-1", "inst-1", {
        accion: "EDITAR_FECHA",
        inicio,
        fin,
      }),
    ).rejects.toThrow(/permisos/);
    expect(tx.instanciaSala.update).not.toHaveBeenCalled();
    expect(tx.eventoProveedor.update).not.toHaveBeenCalled();
  });

  it("otro docente no puede cancelar un encuentro", async () => {
    const tx = txEncuentro();
    await expect(eliminarEncuentro(dbCon(tx), otroDocente, "sol-1", "inst-1")).rejects.toThrow(
      /permisos/,
    );
    expect(tx.instanciaSala.update).not.toHaveBeenCalled();
    expect(tx.eventoProveedor.updateMany).not.toHaveBeenCalled();
  });

  it("otro docente no puede eliminar la reunión completa", async () => {
    const tx = txSolicitud();
    await expect(eliminarReunionCompleta(dbCon(tx), otroDocente, "sol-1")).rejects.toThrow(
      /permisos/,
    );
    expect(tx.solicitudSala.update).not.toHaveBeenCalled();
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });

  it("otro docente no puede agregar encuentros", async () => {
    const tx = txSolicitud();
    await expect(
      agregarEncuentro(dbCon(tx), otroDocente, "sol-1", { inicio, fin }),
    ).rejects.toThrow(/permisos/);
  });

  it("el titular sí puede cancelar su encuentro", async () => {
    const tx = txEncuentro();
    const resultado = await eliminarEncuentro(dbCon(tx), titular, "sol-1", "inst-1");
    expect(resultado.eventoProveedorIds).toEqual(["ev-zoom"]);
  });

  it("administración sí puede cancelar cualquier encuentro", async () => {
    const tx = txEncuentro();
    const resultado = await eliminarEncuentro(dbCon(tx), admin, "sol-1", "inst-1");
    expect(resultado.eventoProveedorIds).toEqual(["ev-zoom"]);
  });
});
