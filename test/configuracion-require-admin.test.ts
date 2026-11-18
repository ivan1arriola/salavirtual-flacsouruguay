import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, redirect, resolveSessionActor } = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveSessionActor: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  })
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor }));

import { requireAdminPage } from "../app/(gestion)/configuracion/require-admin-page";

describe("requireAdminPage", () => {
  beforeEach(() => {
    redirect.mockClear();
    resolveSessionActor.mockReset().mockResolvedValue({ activo: true, rol: "ADMINISTRACION" });
  });

  it.each([[null], [{ user: { role: "DOCENTE" } }]])("redirige a / sin permiso (%j)", async (sesion) => {
    auth.mockResolvedValue(sesion);
    await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/");
  });

  it("redirige si la persona ya no es un administrador activo en la base, aunque el token diga lo contrario", async () => {
    auth.mockResolvedValue({ user: { id: "u1", email: "a@x.uy", role: "ADMINISTRACION" } });
    for (const actor of [null, { activo: false, rol: "ADMINISTRACION" }, { activo: true, rol: "DOCENTE" }]) {
      resolveSessionActor.mockResolvedValue(actor);
      await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/");
    }
  });

  it("devuelve la sesión de ADMINISTRACION", async () => {
    const sesion = { user: { id: "u1", email: "a@x.uy", role: "ADMINISTRACION" } };
    auth.mockResolvedValue(sesion);
    await expect(requireAdminPage()).resolves.toBe(sesion);
  });
});
