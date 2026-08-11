import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import {
  cesarAsistenteTecnicoHastaProximoInicioSesion,
  registrarInicioSesionUsuario
} from "../src/modules/usuarios/estado-asistente.service";

describe("estado temporal del asistente técnico", () => {
  it("registra el cese solicitado por Administración", async () => {
    const update = vi.fn().mockResolvedValue({});
    const createAudit = vi.fn().mockResolvedValue({});
    const tx = {
      usuario: {
        findUnique: vi.fn()
          .mockResolvedValueOnce({ id: "admin", activo: true, rol: "ADMINISTRACION" })
          .mockResolvedValueOnce({
            id: "assistant-user",
            rol: "ASISTENTE_TECNICO",
            asistenteTecnico: { id: "assistant", cesadoHastaProximoInicioSesion: false }
          })
      },
      asistenteTecnico: { update },
      auditoria: { create: createAudit }
    };
    const db = {
      $transaction: (action: (client: typeof tx) => Promise<unknown>) => action(tx)
    } as unknown as PrismaClient;

    await cesarAsistenteTecnicoHastaProximoInicioSesion(
      db,
      { id: "admin", rol: "ADMINISTRACION", activo: true },
      "assistant-user"
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "assistant" },
      data: { cesadoHastaProximoInicioSesion: true }
    });
    expect(createAudit).toHaveBeenCalledOnce();
  });

  it("reactiva el perfil en el siguiente inicio de sesión exitoso", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const createAudit = vi.fn().mockResolvedValue({});
    const tx = {
      usuario: { update: vi.fn().mockResolvedValue({}) },
      asistenteTecnico: { updateMany },
      auditoria: { create: createAudit }
    };
    const db = {
      $transaction: (action: (client: typeof tx) => Promise<unknown>) => action(tx)
    } as unknown as PrismaClient;

    await registrarInicioSesionUsuario(
      db,
      "assistant-user",
      "credentials",
      new Date("2026-08-11T22:00:00.000Z")
    );

    expect(updateMany).toHaveBeenCalledWith({
      where: {
        usuarioId: "assistant-user",
        cesadoHastaProximoInicioSesion: true
      },
      data: { cesadoHastaProximoInicioSesion: false }
    });
    expect(createAudit).toHaveBeenCalledOnce();
  });
});
