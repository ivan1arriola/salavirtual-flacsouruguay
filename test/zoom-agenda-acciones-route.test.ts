import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; role: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  ejecutar: vi.fn()
}));

vi.mock("next/server", () => ({
  NextResponse: class {
    constructor(
      public body: unknown,
      public status = 200
    ) {}
    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init?.status ?? 200);
    }
  }
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: async () => state.actor }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/conferencias.server", () => ({
  obtenerServicioConferencias: () => ({ sincronizarEventosPendientes: async () => [] })
}));
vi.mock("@/src/bootstrap/zoom-agenda-acciones.server", () => ({ ejecutarAccionAgendaZoom: state.ejecutar }));

import { POST } from "../app/api/v1/configuracion/zoom/agenda/acciones/route";

const post = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

const estado = async (body: unknown) => ((await POST(post(body))) as unknown as { status: number }).status;

beforeEach(() => {
  state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
  state.actor = { id: "u", rol: "ADMINISTRACION", activo: true };
  state.ejecutar.mockReset().mockResolvedValue({ eventoProveedorIds: [] });
});

describe("ruta de acciones de la agenda de Zoom", () => {
  it("rechaza sin sesión y a quien no es administración, sin ejecutar nada", async () => {
    const cuerpo = { accion: "IGNORAR", observadaId: "o1" };
    state.session = null;
    expect(await estado(cuerpo)).toBe(403);
    state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "DOCENTE" } };
    state.actor = { id: "u", rol: "DOCENTE", activo: true };
    expect(await estado(cuerpo)).toBe(403);
    expect(state.ejecutar).not.toHaveBeenCalled();
  });

  it("valida la entrada y ejecuta con el actor de sesión", async () => {
    expect(await estado({ accion: "BORRAR_TODO" })).toBe(400);
    expect(await estado({ accion: "RECREAR_EN_ZOOM" })).toBe(400);
    expect(state.ejecutar).not.toHaveBeenCalled();
    expect(await estado({ accion: "RECREAR_EN_ZOOM", instanciaId: "i1" })).toBe(200);
    expect(state.ejecutar).toHaveBeenCalledWith(state.actor, {
      accion: "RECREAR_EN_ZOOM",
      instanciaId: "i1"
    });
  });
});
