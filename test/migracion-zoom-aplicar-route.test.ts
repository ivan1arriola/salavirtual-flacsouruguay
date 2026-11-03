import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; role: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  aplicar: vi.fn(),
  habilitada: false,
}));

vi.mock("next/server", () => ({
  NextResponse: class {
    constructor(public body: unknown, public status = 200) {}
    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init?.status ?? 200);
    }
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: async () => state.actor }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/migracion-zoom.server", () => ({ crearDependenciasMigracionZoom: () => ({ deps: true }) }));
vi.mock("@/src/modules/reuniones/migracion-zoom-aplicar.service", () => ({
  aplicarMigracionZoom: state.aplicar,
  MAXIMO_LOTE_MIGRACION_ZOOM: 10,
}));

vi.mock("@/src/modules/reuniones/reunion-compartida.domain", () => ({
  reunionCompartidaHabilitada: () => state.habilitada,
}));

import { POST } from "../app/api/v1/reuniones/migracion-zoom/aplicar/route";

const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
  state.actor = { id: "u", rol: "ADMINISTRACION", activo: true };
  state.habilitada = false;
  state.aplicar.mockReset().mockResolvedValue([{ instanciaId: "i1", resultado: "MIGRADA" }]);
});

describe("POST /api/v1/reuniones/migracion-zoom/aplicar", () => {
  it("responde 401 sin sesión o con usuario inactivo", async () => {
    state.session = null;
    expect(((await POST(post({ modo: "PILOTO", instanciaIds: ["i1"] }))) as any).status).toBe(401);
    state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
    state.actor = { id: "u", rol: "ADMINISTRACION", activo: false };
    expect(((await POST(post({ modo: "PILOTO", instanciaIds: ["i1"] }))) as any).status).toBe(401);
    expect(state.aplicar).not.toHaveBeenCalled();
  });

  it("valida el cuerpo: exige modo e ids y acota el lote", async () => {
    expect(((await POST(post({ modo: "TODO", instanciaIds: ["i1"] }))) as any).status).toBe(400);
    expect(((await POST(post({ modo: "LOTE", instanciaIds: [] }))) as any).status).toBe(400);
    expect(((await POST(post({ modo: "LOTE", instanciaIds: Array.from({ length: 11 }, (_, i) => `i${i}`) }))) as any).status).toBe(400);
    expect(state.aplicar).not.toHaveBeenCalled();
  });

  it("delega en el servicio con el actor y devuelve resultados por encuentro", async () => {
    const res = (await POST(post({ modo: "PILOTO", instanciaIds: ["i1"] }))) as any;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultados: [{ instanciaId: "i1", resultado: "MIGRADA" }] });
    expect(state.aplicar).toHaveBeenCalledWith({ deps: true }, { id: "u", rol: "ADMINISTRACION" }, { modo: "PILOTO", instanciaIds: ["i1"] });
  });

  it("propaga 403 del servicio a un rol no administrador", async () => {
    const { ForbiddenApiError } = await import("../src/lib/http/api-error");
    state.actor = { id: "u", rol: "DOCENTE", activo: true };
    state.aplicar.mockRejectedValue(new ForbiddenApiError("No"));
    expect(((await POST(post({ modo: "PILOTO", instanciaIds: ["i1"] }))) as any).status).toBe(403);
  });

  it("con la bandera encendida responde 409: la migración se aplica por serie", async () => {
    state.habilitada = true;
    expect(((await POST(post({ modo: "PILOTO", instanciaIds: ["i1"] }))) as any).status).toBe(409);
    expect(state.aplicar).not.toHaveBeenCalled();
  });
});
