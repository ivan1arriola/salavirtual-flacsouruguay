import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn((destino: string) => {
    throw new Error(`REDIRECT:${destino}`);
  }),
}));
vi.mock("@/auth", () => ({ auth }));
vi.mock("next/navigation", () => ({ redirect }));

import { requireAdminPage } from "../app/(gestion)/configuracion/require-admin-page";

describe("requireAdminPage", () => {
  beforeEach(() => {
    redirect.mockClear();
  });

  it.each([[null], [{ user: { role: "DOCENTE" } }]])(
    "redirige a / sin permiso (%j)",
    async (sesion) => {
      auth.mockResolvedValue(sesion);
      await expect(requireAdminPage()).rejects.toThrow("REDIRECT:/");
    },
  );

  it("devuelve la sesión de ADMINISTRACION", async () => {
    const sesion = { user: { role: "ADMINISTRACION" } };
    auth.mockResolvedValue(sesion);
    await expect(requireAdminPage()).resolves.toBe(sesion);
  });
});
