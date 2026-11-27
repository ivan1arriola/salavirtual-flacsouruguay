import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { puedeRedirigirAlPanel } from "../src/lib/auth/login-redirect";

describe("acceso: JWT antiguo no debe provocar bucle de redirecciones", () => {
  it("muestra login cuando no hay sesión", async () => {
    const findUnique = vi.fn();
    const db = { usuario: { findUnique } } as unknown as PrismaClient;
    expect(await puedeRedirigirAlPanel(db, null)).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("muestra login si el ID del JWT ya no existe y nunca recupera por correo", async () => {
    const findUnique = vi.fn().mockResolvedValue(null);
    const findFirst = vi.fn();
    const db = { usuario: { findUnique, findFirst } } as unknown as PrismaClient;
    expect(
      await puedeRedirigirAlPanel(db, {
        id: "id-eliminado",
        email: "reutilizado@flacso.edu.uy",
      }),
    ).toBe(false);
    expect(findUnique).toHaveBeenCalledWith({
      where: { id: "id-eliminado" },
      select: { id: true, rol: true, activo: true },
    });
    expect(findFirst).not.toHaveBeenCalled();
  });

  it("muestra login cuando la cuenta asociada al JWT fue desactivada", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "desactivado",
      rol: "DOCENTE",
      activo: false,
    });
    const db = { usuario: { findUnique } } as unknown as PrismaClient;
    expect(await puedeRedirigirAlPanel(db, { id: "desactivado" })).toBe(false);
  });

  it("permite redirigir al panel con una sesión asociada a un usuario activo", async () => {
    const findUnique = vi.fn().mockResolvedValue({
      id: "vigente",
      rol: "ADMINISTRACION",
      activo: true,
    });
    const db = { usuario: { findUnique } } as unknown as PrismaClient;
    expect(await puedeRedirigirAlPanel(db, { id: "vigente" })).toBe(true);
  });

  it("rechaza el JWT sin identificador interno", async () => {
    const findUnique = vi.fn();
    const db = { usuario: { findUnique } } as unknown as PrismaClient;
    expect(await puedeRedirigirAlPanel(db, { id: "" })).toBe(false);
    expect(findUnique).not.toHaveBeenCalled();
  });
});
