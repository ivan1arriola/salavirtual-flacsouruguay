import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { resolveSessionActor } from "../src/lib/auth/session-actor.adapter";

describe("F9: sesiones vinculadas a una identidad interna estable", () => {
  it("rechaza IDs eliminados aunque el correo esté asociado a una cuenta nueva", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const findFirst = vi.fn().mockResolvedValue({
      id: "usuario-nuevo",
      rol: "ADMINISTRACION",
      activo: true
    });
    const db = { usuario: { findUnique, findFirst } } as unknown as PrismaClient;
    const actor = await resolveSessionActor(db, {
      id: "usuario-borrado",
      email: "reutilizado@flacso.edu.uy"
    });
    expect(actor).toBeNull();
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "usuario-borrado" },
      select: { id: true, rol: true, activo: true }
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("rechaza IDs vacíos sin consultar por email", async () => {
    const findUnique = vi.fn();
    const findFirst = vi.fn();
    const db = { usuario: { findUnique, findFirst } } as unknown as PrismaClient;
    expect(
      await resolveSessionActor(db, {
        id: "  ",
        email: "admin@flacso.edu.uy"
      })
    ).toBeNull();
    expect(findUnique).not.toHaveBeenCalled();
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("no altera la identidad de usuarios con una sesión válida", async () => {
    const user = { id: "usuario-1", rol: "DOCENTE", activo: true };
    const findUnique = vi.fn().mockResolvedValue(user);
    const db = { usuario: { findUnique } } as unknown as PrismaClient;
    expect(
      await resolveSessionActor(db, {
        id: "usuario-1",
        email: "alias@flacso.edu.uy"
      })
    ).toEqual(user);
  });

  it("la sesión de una cuenta desactivada permanece inactiva", async () => {
    const inactive = { id: "usuario-1", rol: "ADMINISTRACION", activo: false };
    const findUnique = vi.fn().mockResolvedValue(inactive);
    const db = { usuario: { findUnique } } as unknown as PrismaClient;
    expect((await resolveSessionActor(db, { id: "usuario-1" }))?.activo).toBe(false);
  });
});
