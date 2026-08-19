import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { actualizarProgramasDocente } from "../src/modules/usuarios/programas-docente.service";

describe("gestión administrativa de integrantes por programa", () => {
  it("agrega asociaciones y desactiva las quitadas sin borrar el historial", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const upsert = vi.fn().mockResolvedValue({});
    const createAudit = vi.fn().mockResolvedValue({});
    const tx = {
      usuario: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "admin", rol: "ADMINISTRACION", activo: true })
          .mockResolvedValueOnce({
            id: "docente-user",
            rol: "DOCENTE",
            activo: true,
            docente: {
              id: "docente",
              programas: [{ programaId: "p-keep" }, { programaId: "p-remove" }]
            }
          })
      },
      programa: { count: vi.fn().mockResolvedValue(2) },
      docente: { create: vi.fn() },
      docentePrograma: { updateMany, upsert },
      auditoria: { create: createAudit }
    };
    const db = {
      $transaction: (action: (client: typeof tx) => Promise<unknown>) => action(tx)
    } as unknown as PrismaClient;

    await actualizarProgramasDocente(
      db,
      { id: "admin", rol: "ADMINISTRACION", activo: true },
      "docente-user",
      { programaIds: ["p-keep", "p-new"] }
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        docenteId: "docente",
        activo: true,
        programaId: { notIn: ["p-keep", "p-new"] }
      },
      data: { activo: false }
    });
    expect(upsert).toHaveBeenCalledTimes(2);
    expect(upsert).toHaveBeenCalledWith({
      where: { docenteId_programaId: { docenteId: "docente", programaId: "p-new" } },
      create: { docenteId: "docente", programaId: "p-new", activo: true },
      update: { activo: true }
    });
    expect(createAudit).toHaveBeenCalledOnce();
  });
});
