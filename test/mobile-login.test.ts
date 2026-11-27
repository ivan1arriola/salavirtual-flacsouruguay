import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  user: null as any,
  tokenRoles: [] as string[],
  storedSessions: [] as unknown[],
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));
vi.mock("@/src/lib/auth/config", () => ({ authConfig: { secret: "s".repeat(32) } }));
vi.mock("@/src/lib/auth/local-login.adapter", () => ({ dependenciasLoginLocal: {} }));
vi.mock("@/src/lib/db", () => ({
  db: {
    tokenVerificacion: {
      create: async ({ data }: { data: unknown }) => {
        state.storedSessions.push(data);
      },
    },
  },
}));
vi.mock("@/src/modules/usuarios/credentials.service", () => ({
  autenticarConCredenciales: async () => state.user,
}));
vi.mock("@/src/lib/auth/mobile-token", () => ({
  mobileSessionIdentifier: (userId: string) => "mobile-session:" + userId,
  mobileSessionHash: (sid: string) => "hashed-" + sid,
  issueMobileToken: (_id: string, _secret: string, role: string) => {
    state.tokenRoles.push(role);
    return {
      accessToken: "token",
      sessionId: "session-random",
      expiresAt: "2027-01-01T00:00:00.000Z",
    };
  },
}));

import { POST } from "../app/api/v1/mobile/auth/login/route";

function request() {
  return new Request("https://example.test/api/v1/mobile/auth/login", {
    method: "POST",
    body: JSON.stringify({ usuario: "user", password: "password" }),
  });
}

beforeEach(() => {
  state.user = null;
  state.tokenRoles = [];
  state.storedSessions = [];
});

describe("mobile login", () => {
  it("rechaza credenciales inválidas", async () => {
    const response = (await POST(request())) as any;

    expect(response.status).toBe(401);
  });

  it("exige cambiar la contraseña antes de emitir un token", async () => {
    state.user = {
      id: "assistant",
      rol: "ASISTENTE_TECNICO",
      nombre: "Asistente",
      email: "a@example.test",
      debeCambiarPassword: true,
    };

    const response = (await POST(request())) as any;

    expect(response.status).toBe(403);
    expect(response.body.code).toBe("PASSWORD_CHANGE_REQUIRED");
    expect(state.tokenRoles).toEqual([]);
  });

  it("rechaza docentes", async () => {
    state.user = {
      id: "teacher",
      rol: "DOCENTE",
      nombre: "Docente",
      email: "d@example.test",
      debeCambiarPassword: false,
    };

    const response = (await POST(request())) as any;

    expect(response.status).toBe(403);
    expect(state.tokenRoles).toEqual([]);
  });

  it("emite un token de administración con el rol en la respuesta", async () => {
    state.user = {
      id: "admin",
      rol: "ADMINISTRACION",
      nombre: "Admin",
      email: "admin@example.test",
      debeCambiarPassword: false,
    };

    const response = (await POST(request())) as any;

    expect(response.status).toBe(200);
    expect(response.body.user.role).toBe("ADMINISTRACION");
    expect(state.tokenRoles).toEqual(["ADMINISTRACION"]);
    expect(state.storedSessions).toHaveLength(1);
    expect(state.storedSessions[0]).toMatchObject({
      identifier: "mobile-session:admin",
      token: "hashed-session-random",
    });
    expect(response.body).not.toHaveProperty("sessionId");
  });
});
