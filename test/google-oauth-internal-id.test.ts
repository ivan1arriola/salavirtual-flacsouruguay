import { describe, expect, it, vi } from "vitest";

const captured = vi.hoisted(() => ({ config: null as any }));
vi.mock("next-auth", () => ({
  default: (config: any) => {
    captured.config = config;
    return {};
  },
}));
vi.mock("@/src/bootstrap/identity.server", () => ({
  obtenerServicioIdentity: () => ({
    resolverUsuarioGoogle: async () => ({
      id: "internal-user",
      nombre: "Docente",
      email: "docente@example.org",
      rol: "DOCENTE",
      debeCambiarPassword: false,
    }),
  }),
}));
vi.mock("@/src/lib/auth/config", () => ({
  authConfig: {
    secret: "test",
    trustHost: true,
    baseUrl: "https://example.org",
    google: { clientId: "test", clientSecret: "test" },
  },
}));
vi.mock("@/src/lib/db", () => ({
  db: {
    usuario: {
      findUnique: async ({ where }: any) =>
        where.id === "internal-user" ? { activo: true, fusionadoEnId: null } : null,
    },
  },
}));
import "../auth";

describe("identidad interna tras normalización OAuth de Auth.js", () => {
  it("conserva el usuario autorizado cuando Auth.js reemplaza el ID del perfil", async () => {
    const provider = captured.config.providers.find((p: any) => p.id === "google");
    const profile = await provider.options.profile({
      sub: "google-subject",
      email: "docente@example.org",
      email_verified: true,
    });
    const user = { ...profile, id: "authjs-random-uuid" };
    const token = await captured.config.callbacks.jwt({
      token: {},
      user,
      account: { provider: "google" },
    });
    const session = captured.config.callbacks.session({ session: { user: {} }, token });
    expect(session.user.id).toBe("internal-user");
    expect(session.user.role).toBe("DOCENTE");
  });
  it("conserva el ID de credenciales locales", async () => {
    const token = await captured.config.callbacks.jwt({
      token: {},
      user: { id: "local-user", role: "DOCENTE", mustChangePassword: false },
      account: { provider: "credentials" },
    });
    expect(token.userId).toBe("local-user");
  });
  it("rechaza Google sin identidad interna en vez de aceptar el UUID", async () => {
    await expect(
      captured.config.callbacks.jwt({
        token: {},
        user: { id: "authjs-random-uuid" },
        account: { provider: "google" },
      }),
    ).rejects.toThrow("La identidad interna");
  });
  it("conserva la identidad en las siguientes lecturas del JWT", async () => {
    const token = { userId: "internal-user", role: "DOCENTE", mustChangePassword: false };
    expect(await captured.config.callbacks.jwt({ token })).toEqual(token);
  });
});
