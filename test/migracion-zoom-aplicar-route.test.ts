import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; role: string } },
}));

vi.mock("next/server", () => ({
  NextResponse: class {
    constructor(
      public body: unknown,
      public status = 200,
    ) {}
    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init?.status ?? 200);
    }
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));

import { POST } from "../app/api/v1/reuniones/migracion-zoom/aplicar/route";

beforeEach(() => {
  state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
});

describe("POST /api/v1/reuniones/migracion-zoom/aplicar", () => {
  it("responde 401 sin sesión", async () => {
    state.session = null;
    expect(((await POST()) as any).status).toBe(401);
  });

  it("responde siempre 409: la migración se aplica por serie", async () => {
    const res = (await POST()) as any;
    expect(res.status).toBe(409);
    expect(res.body).toEqual({
      error: "La migración se aplica por serie: usa la migración por serie.",
    });
  });
});
