import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  resolve: vi.fn(), findFirst: vi.fn(), sync: vi.fn()
}));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: { status?: number; headers?: unknown }) => ({ body, status: init?.status ?? 200 }) } }));
vi.mock("@/auth", () => ({ auth: async () => mock.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: (...args: unknown[]) => mock.resolve(...args) }));
vi.mock("@/src/lib/db", () => ({ db: { eventoProveedor: { findFirst: (...args: unknown[]) => mock.findFirst(...args) } } }));
vi.mock("@/src/bootstrap/archivos.server", () => ({ sincronizarArtefactos: (...args: unknown[]) => mock.sync(...args) }));
import { POST } from "../app/api/v1/reuniones/instancias/[instanciaId]/asistencia/regenerar/route";
const context = { params: Promise.resolve({ instanciaId: "inst-1" }) };
beforeEach(() => {
  mock.session = { user: { id: "u1", email: "a@example.test" } };
  mock.actor = { id: "u1", rol: "DOCENTE", activo: true };
  mock.resolve.mockReset().mockImplementation(async () => mock.actor);
  mock.findFirst.mockReset(); mock.sync.mockReset();
});
describe("regeneración de asistencia", () => {
  it("rechaza rol distinto a administración antes de consultar el encuentro", async () => {
    expect((await POST(new Request("https://example.test"), context) as { status: number }).status).toBe(403);
    expect(mock.findFirst).not.toHaveBeenCalled();
  });
  it("permite regeneración solamente a administración y conserva instancia", async () => {
    mock.actor = { id: "u1", rol: "ADMINISTRACION", activo: true };
    mock.findFirst.mockResolvedValue({ id: "event-1" });
    mock.sync.mockResolvedValue([{ estado: "SINCRONIZADO", archivos: 1 }]);
    expect((await POST(new Request("https://example.test"), context) as { status: number }).status).toBe(200);
    expect(mock.sync).toHaveBeenCalledWith(["event-1"], true);
  });
});
