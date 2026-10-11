import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { hashTokenRecuperacion } from "../src/modules/usuarios/recuperacion-password.domain";

vi.mock("@/src/lib/auth/config", () => ({ authConfig: { baseUrl: "https://example.test" } }));
vi.mock("@/src/modules/configuracion/correo.service", () => ({
  enviarCorreoConfigurado: async () => ({ sent: true })
}));

import { cambiarPasswordPersonal } from "../src/modules/usuarios/perfil.service";
import { restablecerPassword } from "../src/modules/usuarios/recuperacion-password.service";

describe("revocación de sesiones después de modificar contraseña", () => {
  it("revoca los dispositivos al cambiar la contraseña desde el perfil", async () => {
    const identifiers: string[] = [];
    const tx = {
      usuario: { update: vi.fn(async () => ({})) },
      tokenVerificacion: { deleteMany: vi.fn(async ({ where }: { where: { identifier: string } }) => {
        identifiers.push(where.identifier);
        return { count: 1 };
      }) },
      auditoria: { create: vi.fn(async () => ({})) }
    };
    const db = {
      usuario: { findUnique: vi.fn(async () => ({ activo: true, passwordHash: null })) },
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)
    } as unknown as PrismaClient;
    await cambiarPasswordPersonal(db, { id: "usuario-1", rol: "ADMINISTRACION", activo: true }, {
      passwordNueva: "Contraseña2026Segura!",
      confirmarPassword: "Contraseña2026Segura!"
    });
    expect(identifiers).toContain("mobile-session:usuario-1");
  });

  it("revoca los dispositivos al consumir un token de recuperación", async () => {
    const identifiers: string[] = [];
    const rawToken = "recuperacion-de-usuario".repeat(4);
    const tx = {
      tokenVerificacion: { deleteMany: vi.fn(async ({ where }: { where: { identifier: string } }) => {
        identifiers.push(where.identifier);
        return { count: 1 };
      }) },
      usuario: { updateMany: vi.fn(async () => ({ count: 1 })) },
      auditoria: { create: vi.fn(async () => ({})) }
    };
    const db = {
      tokenVerificacion: { findFirst: vi.fn(async () => ({
        identifier: "password-reset:usuario-1",
        token: hashTokenRecuperacion(rawToken),
        expires: new Date("2100-01-01T00:00:00Z")
      })) },
      $transaction: async (fn: (value: typeof tx) => Promise<unknown>) => fn(tx)
    } as unknown as PrismaClient;
    await restablecerPassword(db, {
      token: rawToken, passwordNueva: "Contraseña2026Segura!", confirmarPassword: "Contraseña2026Segura!"
    }, new Date("2026-10-10T12:00:00Z"));
    expect(identifiers).toContain("mobile-session:usuario-1");
  });
});
