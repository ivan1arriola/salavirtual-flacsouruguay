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
    db: { $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient
  };
}

const solicitud = (id: string, estado = "PROVISIONADA") => ({
  id,
  titulo: "Seminario",
  docenteProgramaId: "dp-1",
  createdAt: new Date("2026-10-10T11:00:00Z"),
  estado,
  docentePrograma: { programaId: "programa-1" },
  instancias: [{
    detallesLiquidacion: [],
    eventosProveedor: [
      { id: "zoom-" + id, operacionPendiente: estado === "CANCELADA" ? "CANCELAR" : null,
        proveedor: { tipo: "ZOOM" } }
    ]
  }]
});

describe("cancelación de series con eventos Zoom", () => {
  it("encola la cancelación de los eventos Zoom de una solicitud activa", async () => {
    const { db, tx } = fakeDatabase([solicitud("s1")]);
    const result = await cancelarSolicitudesAtomicas(db, actor, ["s1"]);
    expect(result.eventoProveedorIds).toEqual(["zoom-s1"]);
    expect(tx.eventoProveedor.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["zoom-s1"] } },
      data: expect.objectContaining({ operacionPendiente: "CANCELAR" })
    }));
  });

  it("reintenta los eventos Zoom de una solicitud ya cancelada con cancelación pendiente", async () => {
    const { db } = fakeDatabase([solicitud("s1", "CANCELADA")]);
    const result = await cancelarSolicitudesAtomicas(db, actor, ["s1"]);
    expect(result.eventoProveedorIds).toEqual(["zoom-s1"]);
  });
});
