import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { eliminarUsuarioCompleto } from "../src/modules/usuarios/eliminacion.service";

describe("eliminación administrativa de usuarios", () => {
  it("impide que una persona administradora elimine su propia cuenta", async () => {
    const db = { $transaction: vi.fn() } as unknown as PrismaClient;

    await expect(
      eliminarUsuarioCompleto(db, { id: "admin", rol: "ADMINISTRACION", activo: true }, "admin", "ELIMINAR")
    ).rejects.toThrow("No podés eliminar tu propia cuenta.");

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("exige una confirmación explícita", async () => {
    const db = { $transaction: vi.fn() } as unknown as PrismaClient;

    await expect(
      eliminarUsuarioCompleto(db, { id: "admin", rol: "ADMINISTRACION", activo: true }, "usuario", "eliminar")
    ).rejects.toThrow("La confirmación de eliminación no es válida.");

    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("elimina una identidad simple y deja una auditoría mínima", async () => {
    const deleteUser = vi.fn().mockResolvedValue({});
    const createAudit = vi.fn().mockResolvedValue({});
    const tx = {
      usuario: {
        findUnique: vi
          .fn()
          .mockResolvedValueOnce({ id: "admin", rol: "ADMINISTRACION", activo: true })
          .mockResolvedValueOnce({
            id: "usuario",
            rol: "DOCENTE",
            emailPrincipal: "persona@example.com",
            docente: null,
            asistenteTecnico: null,
            cuentasGoogle: []
          }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        delete: deleteUser
      },
      cohostReunion: { deleteMany: vi.fn() },
      docentePrograma: { findMany: vi.fn(), deleteMany: vi.fn() },
      solicitudSala: { findMany: vi.fn().mockResolvedValue([]), deleteMany: vi.fn() },
      instanciaSala: { findMany: vi.fn() },
      detalleLiquidacionAsistenciaTecnica: { deleteMany: vi.fn() },
      asignacionAsistenciaTecnica: { findMany: vi.fn(), deleteMany: vi.fn() },
      liquidacionAsistenciaTecnica: { findMany: vi.fn(), deleteMany: vi.fn() },
      asistenteTecnico: { delete: vi.fn() },
      docente: { delete: vi.fn() },
      usuarioFusion: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      configuracionGoogleWorkspace: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      tokenVerificacion: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      solicitudAccesoGoogle: { deleteMany: vi.fn().mockResolvedValue({ count: 0 }) },
      auditoria: { create: createAudit }
    };
    const db = {
      $transaction: (action: (client: typeof tx) => Promise<unknown>) => action(tx)
    } as unknown as PrismaClient;

    await eliminarUsuarioCompleto(
      db,
      { id: "admin", rol: "ADMINISTRACION", activo: true },
      "usuario",
      "ELIMINAR"
    );

    expect(createAudit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUsuarioId: "admin",
        accion: "USUARIO_ELIMINADO",
        entidadTipo: "Usuario",
        entidadId: "usuario",
        valorAnterior: { rol: "DOCENTE" }
      })
    });
    expect(deleteUser).toHaveBeenCalledWith({ where: { id: "usuario" } });
  });
});
