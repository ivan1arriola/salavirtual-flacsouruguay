import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), resolveSessionActor: vi.fn(), solicitar: vi.fn(), consultar: vi.fn(), vincular: vi.fn()
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: mocks.resolveSessionActor }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/zoom-historico.server", () => ({
  solicitarRecuperacionZoom: mocks.solicitar,
  consultarRecuperacionZoom: mocks.consultar,
  vincularOcurrenciaZoomAdmin: mocks.vincular
}));

import { POST as crear } from "../app/api/v1/archivos/zoom/recuperaciones/route";
import { GET as progreso } from "../app/api/v1/archivos/zoom/recuperaciones/[barridoId]/route";
import { POST as vincular } from "../app/api/v1/archivos/zoom/ocurrencias/[ocurrenciaId]/vincular/route";

const post = (cuerpo: unknown) => new Request("http://x/api", { method: "POST", body: JSON.stringify(cuerpo) });
const valido = { desde: "2026-01-01", hasta: "2026-02-01" };

function conRol(rol: string, activo = true) {
  mocks.resolveSessionActor.mockResolvedValue({ id: "u", rol, activo });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "u", email: "a@x.com" } });
  conRol("ADMINISTRACION");
  mocks.solicitar.mockResolvedValue({ tipo: "DRY_RUN", ocurrencias: 3 });
});

describe("POST recuperaciones", () => {
  it("sin sesión: 401; docente: 403; ninguno llega a Zoom", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await crear(post(valido))).status).toBe(401);
    conRol("DOCENTE");
    expect((await crear(post(valido))).status).toBe(403);
    conRol("ASISTENTE_TECNICO");
    expect((await crear(post(valido))).status).toBe(403);
    expect(mocks.solicitar).not.toHaveBeenCalled();
  });

  it("cuerpo inválido: 400 sin llegar al caso de uso", async () => {
    for (const c of [null, {}, { desde: 1, hasta: "x" }, { ...valido, anfitrionIds: "h1" }, { ...valido, anfitrionIds: [3] }, { ...valido, dryRun: "no" }]) {
      expect((await crear(post(c))).status).toBe(400);
    }
    expect(mocks.solicitar).not.toHaveBeenCalled();
  });

  it("sin dryRun explícito es una simulación (nunca encola por omisión)", async () => {
    const r = await crear(post(valido));
    expect(r.status).toBe(200);
    expect(mocks.solicitar).toHaveBeenCalledWith({ id: "u", rol: "ADMINISTRACION" }, { anfitrionIds: [], ...valido, dryRun: true });
  });

  it("dryRun:false encola con 202", async () => {
    mocks.solicitar.mockResolvedValueOnce({ tipo: "ENCOLADA", barridoId: "b1" });
    const r = await crear(post({ ...valido, dryRun: false }));
    expect(r.status).toBe(202);
    expect(mocks.solicitar.mock.calls[0]![1].dryRun).toBe(false);
  });

  it("peticiones rechazadas por el caso de uso → 400; Zoom sin configurar → 409; fallo interno → 500 sin detalle", async () => {
    mocks.solicitar.mockResolvedValueOnce({ tipo: "PETICION_INVALIDA", motivo: "PERIODO_INVERTIDO" });
    expect((await crear(post(valido))).status).toBe(400);
    mocks.solicitar.mockResolvedValueOnce({ tipo: "ZOOM_NO_CONFIGURADO" });
    expect((await crear(post(valido))).status).toBe(409);
    mocks.solicitar.mockRejectedValueOnce(new Error("secreto interno"));
    const r = await crear(post(valido));
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toContain("secreto");
  });
});

describe("GET recuperaciones/[barridoId]", () => {
  const ctx = { params: Promise.resolve({ barridoId: "b1" }) };

  it("solo administración", async () => {
    conRol("DOCENTE");
    expect((await progreso(new Request("http://x"), ctx)).status).toBe(403);
    expect(mocks.consultar).not.toHaveBeenCalled();
  });

  it("devuelve el progreso, o 404 si no existe", async () => {
    mocks.consultar.mockResolvedValueOnce({ id: "b1", estado: "EN_CURSO" });
    expect((await progreso(new Request("http://x"), ctx)).status).toBe(200);
    mocks.consultar.mockResolvedValueOnce(null);
    expect((await progreso(new Request("http://x"), ctx)).status).toBe(404);
  });
});

describe("POST ocurrencias/[ocurrenciaId]/vincular", () => {
  const ctx = { params: Promise.resolve({ ocurrenciaId: "o1" }) };

  it("verifica el rol en el servidor: docente → 403 sin vincular", async () => {
    conRol("DOCENTE");
    expect((await vincular(post({ eventoId: "e1" }), ctx)).status).toBe(403);
    expect(mocks.vincular).not.toHaveBeenCalled();
  });

  it("eventoId ausente o inválido: 400", async () => {
    for (const c of [null, {}, { eventoId: 5 }, { eventoId: "" }]) expect((await vincular(post(c), ctx)).status).toBe(400);
    expect(mocks.vincular).not.toHaveBeenCalled();
  });

  it("mapea los resultados: vinculada 200, otro encuentro 409, conflicto Drive 409, no zoom 422, no encontrada 404", async () => {
    const casos: Array<[object, number]> = [
      [{ tipo: "VINCULADA", referenciasCreadas: 2 }, 200], [{ tipo: "YA_VINCULADA" }, 200],
      [{ tipo: "VINCULADA_A_OTRO", eventoProveedorId: "e9" }, 409], [{ tipo: "CONFLICTO_DRIVE" }, 409],
      [{ tipo: "EVENTO_NO_ZOOM" }, 422], [{ tipo: "NO_ENCONTRADA", recurso: "OCURRENCIA" }, 404]
    ];
    for (const [resultado, status] of casos) {
      mocks.vincular.mockResolvedValueOnce(resultado);
      expect((await vincular(post({ eventoId: "e1" }), ctx)).status).toBe(status);
    }
    expect(mocks.vincular).toHaveBeenCalledWith({ id: "u", rol: "ADMINISTRACION" }, "o1", "e1");
  });
});
