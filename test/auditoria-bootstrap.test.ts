import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/src/lib/db", () => ({
  db: {
    auditoria: {
      create: vi.fn().mockResolvedValue({ id: "aud-mock-1" })
    }
  }
}));

import {
  obtenerServicioAuditoria,
  crearServicioAuditoriaTransaccional
} from "@/src/bootstrap/auditoria.server";

describe("bootstrap auditoria.server", () => {
  it("compone el caso de uso con el cliente prisma por defecto", async () => {
    const servicio = obtenerServicioAuditoria();
    const resultado = await servicio.registrar({
      accion: "BOOTSTRAP_TEST",
      entidadTipo: "Sistema",
      entidadId: "sis-1",
      timestamp: new Date("2026-09-19T15:00:00Z")
    });

    expect(resultado.ok).toBe(true);
  });

  it("permite componer un servicio transaccional con un cliente tx especifico", async () => {
    const mockTxCreate = vi.fn().mockResolvedValue({ id: "aud-tx-1" });
    const mockTx = {
      auditoria: {
        create: mockTxCreate
      }
    } as any;

    const servicioTx = crearServicioAuditoriaTransaccional(mockTx);
    const resultado = await servicioTx.registrar({
      accion: "BOOTSTRAP_TX_TEST",
      entidadTipo: "Transaccion",
      entidadId: "tx-100",
      timestamp: new Date("2026-09-19T15:05:00Z")
    });

    expect(resultado.ok).toBe(true);
    expect(mockTxCreate).toHaveBeenCalledOnce();
  });
});
