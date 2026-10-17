import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";

describe("servicio de desvinculación de monitoreo", () => {
  it("cancela la asignación activa y registra quién la desvinculó", async () => {
    const moduleUrl = new URL("../src/modules/asistencia/desvinculacion-asistencia.service.ts", import.meta.url);
    const modulePath = fileURLToPath(moduleUrl);
    expect(existsSync(modulePath)).toBe(true);
    if (!existsSync(modulePath)) return;

    const service = await vi.importActual<any>(moduleUrl.href);
    const update = vi.fn().mockResolvedValue({ id: "asig-1", instanciaSalaId: "inst-1", estado: "CANCELADO" });
    const audit = vi.fn().mockResolvedValue({});
    const tx = {
      usuario: { findUnique: vi.fn().mockResolvedValue({ id: "admin-1", activo: true, rol: "ADMINISTRACION" }) },
      asignacionAsistenciaTecnica: {
        findUnique: vi.fn().mockResolvedValue({
          id: "asig-1",
          instanciaSalaId: "inst-1",
          asistenteTecnicoId: "at-1",
          estado: "ACEPTADO",
          detallesLiquidacion: [],
          asistenteTecnico: { usuario: { emailPrincipal: null, cuentasGoogle: [] } }
        }),
        update
      },
      cohostReunion: { deleteMany: vi.fn() },
      cohostEmailReunion: { deleteMany: vi.fn() },
      auditoria: { create: audit }
    };
    const db = { $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx) } as unknown as PrismaClient;

    const result = await service.desvincularAsistenteAsignado(
      db,
      { id: "admin-1", rol: "ADMINISTRACION", activo: true },
      { asignacionId: "asig-1" }
    );

    expect(update).toHaveBeenCalledWith({
      where: { id: "asig-1" },
      data: { estado: "CANCELADO" },
      select: { id: true, instanciaSalaId: true, estado: true }
    });
    expect(audit).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorUsuarioId: "admin-1",
        accion: "ASISTENTE_DESVINCULADO",
        entidadTipo: "InstanciaSala",
        entidadId: "inst-1",
        valorAnterior: { asistenteTecnicoId: "at-1", estado: "ACEPTADO" },
        valorNuevo: { asistenteTecnicoId: "at-1", estado: "CANCELADO" }
      })
    });
    expect(result.estado).toBe("CANCELADO");
  });
});
