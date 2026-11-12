import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { cancelarSolicitudesAtomicas } from "../src/modules/reuniones/cancelar-solicitudes-atomicas.service";

vi.mock("../src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: vi.fn(async () => true)
}));
vi.mock("../src/modules/reuniones/reserva-salas.adapter", () => ({
  bloquearSolicitudSala: vi.fn(async () => {})
}));

const actor = { id: "admin", rol: "ADMINISTRACION" as const, activo: true };

function fakeDatabase(solicitudes: readonly unknown[]) {
  const tx = {
    solicitudSala: { findMany: vi.fn(async () => solicitudes), update: vi.fn(async () => ({})) },
    instanciaSala: { updateMany: vi.fn(async () => ({ count: 1 })) },
    eventoProveedor: { updateMany: vi.fn(async () => ({ count: 1 })) },
    auditoria: { create: vi.fn(async () => ({})) }
  };
  return {
    tx,
    db: {
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)
    } as unknown as PrismaClient
  };
}

const solicitud = (id: string, estado = "PROVISIONADA") => ({
  id,
  titulo: "Seminario",
  docenteProgramaId: "dp-1",
  createdAt: new Date("2026-10-10T11:00:00Z"),
  estado,
  docentePrograma: { programaId: "programa-1", docente: { usuarioId: "titular" } },
  instancias: [
    {
      detallesLiquidacion: [],
      eventosProveedor: [
        {
          id: "zoom-" + id,
          operacionPendiente: estado === "CANCELADA" ? "CANCELAR" : null,
          proveedor: { tipo: "ZOOM" }
        }
      ]
    }
  ]
});

describe("cancelación de series con eventos Zoom", () => {
  it("encola la cancelación de los eventos Zoom de una solicitud activa", async () => {
    const { db, tx } = fakeDatabase([solicitud("s1")]);
    const result = await cancelarSolicitudesAtomicas(db, actor, ["s1"]);
    expect(result.eventoProveedorIds).toEqual(["zoom-s1"]);
    expect(tx.eventoProveedor.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: { in: ["zoom-s1"] } },
        data: expect.objectContaining({ operacionPendiente: "CANCELAR" })
      })
    );
  });

  it("reintenta los eventos Zoom de una solicitud ya cancelada con cancelación pendiente", async () => {
    const { db } = fakeDatabase([solicitud("s1", "CANCELADA")]);
    const result = await cancelarSolicitudesAtomicas(db, actor, ["s1"]);
    expect(result.eventoProveedorIds).toEqual(["zoom-s1"]);
  });
});

describe("cancelación de serie: solo el titular o administración", () => {
  it("otro docente del programa no puede cancelar la serie y no se escribe nada", async () => {
    const { db, tx } = fakeDatabase([solicitud("s1")]);
    const otro = { id: "otro", rol: "DOCENTE" as const, activo: true };
    await expect(cancelarSolicitudesAtomicas(db, otro, ["s1"])).rejects.toThrow(/permisos/);
    expect(tx.auditoria.create).not.toHaveBeenCalled();
    expect(tx.solicitudSala.update).not.toHaveBeenCalled();
    expect(tx.eventoProveedor.updateMany).not.toHaveBeenCalled();
  });

  it("el docente titular sí puede cancelar su serie", async () => {
    const { db } = fakeDatabase([solicitud("s1")]);
    const titular = { id: "titular", rol: "DOCENTE" as const, activo: true };
    const result = await cancelarSolicitudesAtomicas(db, titular, ["s1"]);
    expect(result.solicitudesCanceladas).toBe(1);
  });
});
