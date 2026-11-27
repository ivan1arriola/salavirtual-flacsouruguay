import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  resolve: vi.fn(),
  findFirst: vi.fn(),
  sync: vi.fn(),
  instancia: vi.fn(),
  regenerarZoom: vi.fn(),
}));
vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: unknown }) => ({
      body,
      status: init?.status ?? 200,
    }),
  },
}));
vi.mock("@/auth", () => ({ auth: async () => mock.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: (...args: unknown[]) => mock.resolve(...args),
}));
vi.mock("@/src/lib/db", () => ({
  db: {
    eventoProveedor: { findFirst: (...args: unknown[]) => mock.findFirst(...args) },
    instanciaSala: { findUnique: (...args: unknown[]) => mock.instancia(...args) },
  },
}));
vi.mock("@/src/bootstrap/archivos.server", () => ({
  sincronizarArtefactos: (...args: unknown[]) => mock.sync(...args),
}));
vi.mock("@/src/bootstrap/zoom-asistencia.server", () => ({
  regenerarAsistenciaInstanciaZoom: (...args: unknown[]) => mock.regenerarZoom(...args),
}));
import { POST } from "../app/api/v1/reuniones/instancias/[instanciaId]/asistencia/regenerar/route";
const context = { params: Promise.resolve({ instanciaId: "inst-1" }) };
beforeEach(() => {
  mock.session = { user: { id: "u1", email: "a@example.test" } };
  mock.actor = { id: "u1", rol: "DOCENTE", activo: true };
  mock.resolve.mockReset().mockImplementation(async () => mock.actor);
  mock.findFirst.mockReset();
  mock.sync.mockReset();
  mock.instancia.mockReset().mockResolvedValue({ proveedorActivoTipo: null });
  mock.regenerarZoom.mockReset();
});
describe("regeneración de asistencia", () => {
  it("rechaza rol distinto a administración antes de consultar el encuentro", async () => {
    expect(
      ((await POST(new Request("https://example.test"), context)) as { status: number }).status,
    ).toBe(403);
    expect(mock.findFirst).not.toHaveBeenCalled();
  });
  it("permite regeneración solamente a administración y conserva instancia", async () => {
    mock.actor = { id: "u1", rol: "ADMINISTRACION", activo: true };
    mock.findFirst.mockResolvedValue({ id: "event-1" });
    mock.sync.mockResolvedValue([{ estado: "SINCRONIZADO", archivos: 1 }]);
    expect(
      ((await POST(new Request("https://example.test"), context)) as { status: number }).status,
    ).toBe(200);
    expect(mock.sync).toHaveBeenCalledWith(["event-1"], true);
  });
  it("en una serie migrada a Zoom con evento Meet conservado sincroniza Zoom, no Meet", async () => {
    mock.actor = { id: "u1", rol: "ADMINISTRACION", activo: true };
    mock.instancia.mockResolvedValue({ proveedorActivoTipo: "ZOOM" });
    mock.findFirst.mockImplementation(
      async ({ where }: { where: { proveedor: { tipo: string } } }) => ({
        id: `evento-${where.proveedor.tipo}`,
      }),
    );
    mock.regenerarZoom.mockResolvedValue({
      ocurrencias: 1,
      resultados: [
        { sincronizacion: { tipo: "PENDIENTE" }, planilla: { tipo: "ERROR", codigo: "X" } },
      ],
    });
    const respuesta = (await POST(new Request("https://example.test"), context)) as {
      status: number;
      body: { proveedor?: string };
    };
    expect(respuesta.body.proveedor).toBe("ZOOM");
    expect(mock.regenerarZoom).toHaveBeenCalledWith("inst-1");
    expect(mock.sync).not.toHaveBeenCalled();
  });
});
