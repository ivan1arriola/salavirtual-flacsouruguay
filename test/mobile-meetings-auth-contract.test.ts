import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireMobileActor: vi.fn(),
  findUnique: vi.fn()
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({
    body, status: init?.status ?? 200
  }) }
}));
vi.mock("@/src/lib/auth/mobile-actor.adapter", () => ({
  MobileActorError: class MobileActorError extends Error {
    constructor(message: string, public readonly status: 401 | 403) { super(message); }
  },
  requireMobileActor: mocks.requireMobileActor
}));
vi.mock("@/src/lib/db", () => ({
  db: { asistenteTecnico: { findUnique: mocks.findUnique }, instanciaSala: { findMany: vi.fn() } }
}));

import { GET } from "../app/api/v1/mobile/reuniones/route";
import { MobileActorError } from "../src/lib/auth/mobile-actor.adapter";

describe("GET /api/v1/mobile/reuniones: contract de autenticación", () => {
  it("responde 401 al token inválido", async () => {
    mocks.requireMobileActor.mockReset().mockRejectedValueOnce(new MobileActorError("Token inválido", 401));
    const response = await GET(new Request("https://example.test/api/v1/mobile/reuniones")) as unknown as { status: number };
    expect(response.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("responde 403 al rol prohibido", async () => {
    mocks.requireMobileActor.mockReset().mockRejectedValueOnce(new MobileActorError("Rol prohibido", 403));
    const response = await GET(new Request("https://example.test/api/v1/mobile/reuniones")) as unknown as { status: number };
    expect(response.status).toBe(403);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("no oculta errores internos como errores de autenticación", async () => {
    mocks.requireMobileActor.mockReset().mockRejectedValueOnce(new Error("database unavailable"));
    await expect(GET(new Request("https://example.test/api/v1/mobile/reuniones"))).rejects.toThrow("database unavailable");
  });
});
