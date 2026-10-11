import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  token: { sub: "usuario-1", v: 2, sid: "sesion-123" } as { sub: string; v: number; sid?: string } | null,
  removed: [] as unknown[]
}));

vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, options?: { status?: number }) => ({
    status: options?.status ?? 200, body
  }) }
}));
vi.mock("@/src/lib/auth/config", () => ({ authConfig: { secret: "test-secret" } }));
vi.mock("@/src/lib/auth/mobile-token", () => ({
  mobileActorFromRequest: () => state.token,
  mobileSessionIdentifier: (id: string) => "mobile-session:" + id,
  mobileSessionHash: (sid: string) => "sha:" + sid
}));
vi.mock("@/src/lib/db", () => ({
  db: { tokenVerificacion: { deleteMany: async ({ where }: { where: unknown }) => {
    state.removed.push(where);
    return { count: 1 };
  } } }
}));

import { POST } from "../app/api/v1/mobile/auth/logout/route";

beforeEach(() => {
  state.token = { sub: "usuario-1", v: 2, sid: "sesion-123" };
  state.removed = [];
});

describe("logout móvil", () => {
  it("revoca solo el dispositivo identificado por su sesión", async () => {
    const result = await POST(new Request("https://example.test")) as any;
    expect(result.status).toBe(200);
    expect(state.removed).toEqual([{
      identifier: "mobile-session:usuario-1", token: "sha:sesion-123"
    }]);
  });

  it("no declara revocado un token antiguo sin sesión", async () => {
    state.token = { sub: "usuario-1", v: 1 };
    const result = await POST(new Request("https://example.test")) as any;
    expect(result.status).toBe(409);
    expect(state.removed).toEqual([]);
  });
});
