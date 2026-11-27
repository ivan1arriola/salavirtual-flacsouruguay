import { beforeEach, describe, it, expect, vi } from "vitest";
const m = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  reintentar: vi.fn(),
  candidatos: vi.fn(),
}));
vi.mock("@/auth", () => ({ auth: m.auth }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: m.actor }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/zoom-historico.server", () => ({
  reintentarArchivoZoomAdmin: m.reintentar,
  listarEncuentrosCandidatosZoomAdmin: m.candidatos,
}));
import { POST } from "../app/api/v1/archivos/zoom/archivos/[archivoId]/reintentar/route";
import { GET } from "../app/api/v1/archivos/zoom/ocurrencias/[ocurrenciaId]/candidatos/route";
const req = new Request("http://x");
const archivo = { params: Promise.resolve({ archivoId: "a" }) };
const ocurrencia = { params: Promise.resolve({ ocurrenciaId: "o" }) };
beforeEach(() => {
  vi.clearAllMocks();
  m.auth.mockResolvedValue({ user: { id: "u" } });
  m.actor.mockResolvedValue({ id: "u", rol: "ADMINISTRACION", activo: true });
});
describe("rutas de controles", () => {
  it("requieren sesión y administración", async () => {
    m.auth.mockResolvedValueOnce(null);
    expect((await POST(req, archivo)).status).toBe(401);
    m.actor.mockResolvedValueOnce({ id: "u", rol: "DOCENTE", activo: true });
    expect((await GET(req, ocurrencia)).status).toBe(403);
    expect(m.reintentar).not.toHaveBeenCalled();
    expect(m.candidatos).not.toHaveBeenCalled();
  });
  it.each([
    ["OK", 200],
    ["NO_ENCONTRADO", 404],
    ["ESTADO_NO_REINTENTABLE", 409],
    ["PROHIBIDO", 403],
  ] as const)("reintento %s", async (tipo, status) => {
    m.reintentar.mockResolvedValue({ tipo });
    expect((await POST(req, archivo)).status).toBe(status);
  });
  it.each([
    ["OK", 200],
    ["NO_ENCONTRADO", 404],
    ["PROHIBIDO", 403],
  ] as const)("candidatos %s", async (tipo, status) => {
    m.candidatos.mockResolvedValue({ tipo, candidatos: [] });
    expect((await GET(req, ocurrencia)).status).toBe(status);
  });
});
