import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; role: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  preview: vi.fn(),
  update: vi.fn(),
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
vi.mock("@/src/modules/reuniones/migracion-zoom.service", () => ({
  obtenerVistaPreviaMigracionZoom: state.preview,
  actualizarExcepcionGoogleMeet: state.update,
}));

import { GET } from "../app/api/v1/reuniones/migracion-zoom/vista-previa/route";
import { PATCH } from "../app/api/v1/reuniones/instancias/[instanciaId]/excepcion-meet/route";

const context = { params: Promise.resolve({ instanciaId: "i1" }) };
const patch = (body: unknown) => new Request("http://localhost/x", { method: "PATCH", body: JSON.stringify(body) });

beforeEach(() => {
  state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
  state.actor = { id: "u", rol: "ADMINISTRACION", activo: true };
  state.preview.mockReset().mockResolvedValue({ filas: [] });
  state.update.mockReset().mockResolvedValue({ id: "i1", conservarGoogleMeet: true });
});

describe("rutas de migración a Zoom", () => {
  it("responden 401 sin sesión o con usuario inactivo, sin invocar el servicio", async () => {
    state.session = null;
    expect(((await GET()) as any).status).toBe(401);
    expect(((await PATCH(patch({ conservar: true, motivo: "x" }), context)) as any).status).toBe(401);

    state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
    state.actor = { id: "u", rol: "ADMINISTRACION", activo: false };
    expect(((await GET()) as any).status).toBe(401);
    expect(state.preview).not.toHaveBeenCalled();
    expect(state.update).not.toHaveBeenCalled();
  });

  it("propagan el rechazo 403 del servicio a un rol no administrador", async () => {
    const { ForbiddenApiError } = await import("../src/lib/http/api-error");
    state.actor = { id: "u", rol: "DOCENTE", activo: true };
    state.preview.mockRejectedValue(new ForbiddenApiError("No"));
    state.update.mockRejectedValue(new ForbiddenApiError("No"));
    expect(((await GET()) as any).status).toBe(403);
    expect(((await PATCH(patch({ conservar: true, motivo: "Motivo" }), context)) as any).status).toBe(403);
    expect(state.preview).toHaveBeenCalledWith({}, { id: "u", rol: "DOCENTE" });
  });

  it("valida el cuerpo y delega la excepción con el actor de sesión", async () => {
    expect(((await PATCH(patch({ conservar: "si" }), context)) as any).status).toBe(400);
    expect(state.update).not.toHaveBeenCalled();

    const response = await PATCH(patch({ conservar: true, motivo: "Motivo" }), context) as any;
    expect(response.status).toBe(200);
    expect(state.update).toHaveBeenCalledWith({}, { id: "u", rol: "ADMINISTRACION" }, { instanciaId: "i1", conservar: true, motivo: "Motivo" });
  });
});
