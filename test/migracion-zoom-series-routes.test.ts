import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; role: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  aplicar: vi.fn(),
  vistaPrevia: vi.fn(),
  habilitada: true,
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
vi.mock("@/src/modules/reuniones/migracion-zoom-serie-aplicar.service", () => ({
  aplicarMigracionZoomSerie: state.aplicar,
  MAXIMO_LOTE_MIGRACION_ZOOM_SERIE: 5,
}));
vi.mock("@/src/modules/reuniones/migracion-zoom-serie.service", () => ({
  obtenerVistaPreviaMigracionZoomPorSerie: state.vistaPrevia,
}));
vi.mock("@/src/modules/reuniones/reunion-compartida.domain", () => ({
  reunionCompartidaHabilitada: () => state.habilitada,
}));

import { POST } from "../app/api/v1/reuniones/migracion-zoom/series/aplicar/route";
import { GET } from "../app/api/v1/reuniones/migracion-zoom/series/vista-previa/route";

const post = (body: unknown) => new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
  state.actor = { id: "u", rol: "ADMINISTRACION", activo: true };
  state.habilitada = true;
  state.aplicar.mockReset().mockResolvedValue([{ serieClave: "serie:s", resultado: "MIGRADA" }]);
  state.vistaPrevia.mockReset().mockResolvedValue({ modo: "SERIE", filas: [] });
});

describe("rutas de migración por serie", () => {
  it("responden 401 sin sesión o con usuario inactivo", async () => {
    state.session = null;
    expect(((await POST(post({ modo: "PILOTO", serieClaves: ["serie:s"] }))) as any).status).toBe(401);
    expect(((await GET()) as any).status).toBe(401);
    state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
    state.actor = { id: "u", rol: "ADMINISTRACION", activo: false };
    expect(((await POST(post({ modo: "PILOTO", serieClaves: ["serie:s"] }))) as any).status).toBe(401);
    expect(state.aplicar).not.toHaveBeenCalled();
  });

  it("con la bandera apagada responden 409 sin tocar nada", async () => {
    state.habilitada = false;
    expect(((await POST(post({ modo: "PILOTO", serieClaves: ["serie:s"] }))) as any).status).toBe(409);
    expect(((await GET()) as any).status).toBe(409);
    expect(state.aplicar).not.toHaveBeenCalled();
    expect(state.vistaPrevia).not.toHaveBeenCalled();
  });

  it("valida el cuerpo: exige modo y claves y acota el lote", async () => {
    expect(((await POST(post({ modo: "TODO", serieClaves: ["serie:s"] }))) as any).status).toBe(400);
    expect(((await POST(post({ modo: "LOTE", serieClaves: [] }))) as any).status).toBe(400);
    expect(((await POST(post({ modo: "LOTE", serieClaves: Array.from({ length: 6 }, (_, i) => `serie:${i}`) }))) as any).status).toBe(400);
    expect(((await POST(post({ modo: "PILOTO", instanciaIds: ["i1"] }))) as any).status).toBe(400);
    expect(state.aplicar).not.toHaveBeenCalled();
  });

  it("delega en el servicio con el actor y devuelve resultados por serie", async () => {
    const res = (await POST(post({ modo: "PILOTO", serieClaves: ["serie:s"] }))) as any;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultados: [{ serieClave: "serie:s", resultado: "MIGRADA" }] });
    expect(state.aplicar).toHaveBeenCalledWith({ deps: true }, { id: "u", rol: "ADMINISTRACION" }, { modo: "PILOTO", serieClaves: ["serie:s"] });
    expect(((await GET()) as any).body).toEqual({ vistaPrevia: { modo: "SERIE", filas: [] } });
  });
});
