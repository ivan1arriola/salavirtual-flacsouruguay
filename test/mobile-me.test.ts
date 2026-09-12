import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: { id: "assistant", rol: "ASISTENTE_TECNICO", activo: true },
  user: {
    id: "assistant",
    nombres: "Ada",
    apellidos: "Lovelace",
    emailPrincipal: "ada@example.test",
    rol: "ASISTENTE_TECNICO"
  }
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 })
  }
}));
vi.mock("@/src/lib/auth/mobile-actor.adapter", () => ({
  MobileActorError: class MobileActorError extends Error {
    status: number;
    constructor(message: string, status: number) { super(message); this.status = status; }
  },
  requireMobileActor: async () => state.actor
}));
vi.mock("@/src/lib/db", () => ({
  db: { usuario: { findUnique: async () => state.user } }
}));

import { GET } from "../app/api/v1/mobile/me/route";

beforeEach(() => {
  state.actor = { id: "assistant", rol: "ASISTENTE_TECNICO", activo: true };
  state.user = {
    id: "assistant", nombres: "Ada", apellidos: "Lovelace", emailPrincipal: "ada@example.test",
    rol: "ASISTENTE_TECNICO"
  };
});

describe("GET /api/v1/mobile/me", () => {
  it("devuelve el perfil vigente de un asistente con su rol", async () => {
    const response = await GET(new Request("https://example.test/api/v1/mobile/me")) as any;

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      user: {
        id: "assistant",
        name: "Ada Lovelace",
        email: "ada@example.test",
        role: "ASISTENTE_TECNICO"
      }
    });
  });
});
