import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { cancelarSolicitudesAtomicas } from "../src/modules/reuniones/cancelar-solicitudes-atomicas.service";

vi.mock("../src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: vi.fn(async () => true),
}));
vi.mock("../src/modules/reuniones/reserva-salas.adapter", () => ({
  bloquearSolicitudSala: vi.fn(async () => {}),
}));

const actor = { id: "admin", rol: "ADMINISTRACION" as const, activo: true };

function fakeDatabase(solicitudes: readonly unknown[]) {
  const tx = {
    solicitudSala: {
      findMany: vi.fn(async () => solicitudes),
      update: vi.fn(async () => ({})),
    },
    instanciaSala: { updateMany: vi.fn(async () => ({ count: 1 })) },
    eventoProveedor: { updateMany: vi.fn(async () => ({ count: 1 })) },
    auditoria: { create: vi.fn(async () => ({})) },
  };
  return {
    tx,
    db: {
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx),
    } as unknown as PrismaClient,
  };
}

const solicitud = (id: string, liquidada = false, estado = "PROVISIONADA") => ({
  id,
  titulo: "Seminario",
  docenteProgramaId: "dp-1",
  createdAt: new Date("2026-10-10T11:00:00Z"),
  estado,
  docentePrograma: { programaId: "programa-1" },
  instancias: [
    {
      detallesLiquidacion: liquidada ? [{ id: "liquidacion" }] : [],
      eventosProveedor: [
        {
          id: "google-" + id,
          operacionPendiente: estado === "CANCELADA" ? "CANCELAR" : null,
          proveedor: { tipo: "GOOGLE_MEET" },
        },
        { id: "zoom-" + id, operacionPendiente: null, proveedor: { tipo: "ZOOM_HISTORICO" } },
      ],
    },
  ],
});

describe("cancelación atómica de solicitudes de una serie", () => {
  it("valida todas las solicitudes antes de escribir", async () => {
    const { db, tx } = fakeDatabase([solicitud("s1"), solicitud("s2", true)]);
    await expect(cancelarSolicitudesAtomicas(db, actor, ["s1", "s2"])).rejects.toThrow(
      /liquidaciones/,
    );
    expect(tx.auditoria.create).not.toHaveBeenCalled();
    expect(tx.solicitudSala.update).not.toHaveBeenCalled();
    expect(tx.eventoProveedor.updateMany).not.toHaveBeenCalled();
  });

  it("registra solo eventos Google y evita auditar nuevamente solicitudes canceladas", async () => {
    const { db, tx } = fakeDatabase([solicitud("s1"), solicitud("s2", false, "CANCELADA")]);
    const result = await cancelarSolicitudesAtomicas(db, actor, ["s1", "s2"]);
    expect(result).toEqual({
      solicitudesCanceladas: 1,
      eventoProveedorIds: ["google-s1", "google-s2"],
    });
    expect(tx.auditoria.create).toHaveBeenCalledTimes(1);
    expect(tx.solicitudSala.update).toHaveBeenCalledTimes(1);
  });

  it("rechaza solicitudes de series distintas", async () => {
    const unrelated = { ...solicitud("s2"), titulo: "Otra reunión" };
    const { db, tx } = fakeDatabase([solicitud("s1"), unrelated]);
    await expect(cancelarSolicitudesAtomicas(db, actor, ["s1", "s2"])).rejects.toThrow(
      /misma serie/,
    );
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });

  it("no registra cambios si falta una solicitud", async () => {
    const { db, tx } = fakeDatabase([solicitud("s1")]);
    await expect(cancelarSolicitudesAtomicas(db, actor, ["s1", "s2"])).rejects.toThrow(/no existe/);
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });
});
