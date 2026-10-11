import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  session: { user: { id: "admin-1", email: "admin@example.test", role: "ADMINISTRACION" } } as { user: { id: string; email: string; role: string } } | null,
  actor: { id: "admin-1", rol: "ADMINISTRACION", activo: true } as { id: string; rol: string; activo: boolean } | null,
  resolveSessionActor: vi.fn(),
  workspaceFindUnique: vi.fn(),
  workspaceFindMany: vi.fn(),
  userFindUnique: vi.fn(),
  payments: vi.fn()
}));

vi.mock("next/server", () => ({
  NextResponse: class {
    status: number;
    constructor(_body: unknown, init?: { status?: number }) {
      this.status = init?.status ?? 200;
    }
    static json(body: unknown, init?: { status?: number }) {
      return { body, status: init?.status ?? 200 };
    }
  }
}));
vi.mock("@/auth", () => ({ auth: async () => mock.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: (...args: unknown[]) => mock.resolveSessionActor(...args)
}));
vi.mock("@/src/lib/db", () => ({
  db: {
    configuracionGoogleWorkspace: {
      findUnique: mock.workspaceFindUnique,
      findMany: mock.workspaceFindMany
    },
    usuario: { findUnique: mock.userFindUnique }
  }
}));
vi.mock("@/src/modules/asistencia/planilla-pagos.adapter", () => ({
  obtenerFilasPlanillaPagos: (...args: unknown[]) => mock.payments(...args)
}));
vi.mock("@/src/modules/asistencia/planilla-pagos.xlsx", () => ({
  crearPlanillaPagos: vi.fn()
}));
vi.mock("@/src/modules/asistencia/reporte-mensual.domain", () => ({
  periodoMesAnteriorUtc3: vi.fn(() => ({ clave: "2026-09" }))
}));
vi.mock("@/src/modules/configuracion/google-workspace.service", () => ({
  actualizarSeccionGoogleWorkspace: vi.fn()
}));
vi.mock("@/src/modules/usuarios/cuentas-google.service", () => ({
  reemplazarCuentasGooglePermitidas: vi.fn()
}));

import { GET as getPayments } from "../app/api/v1/asistencia/planilla-pagos/route";
import { GET as getWorkspace } from "../app/api/v1/configuracion/google-workspace/route";
import { GET as getUserAccounts } from "../app/api/v1/usuarios/[usuarioId]/cuentas-google/route";

const context = { params: Promise.resolve({ usuarioId: "user-2" }) };
const sensitiveReads = [
  ["asistencia/planilla-pagos", () => getPayments()],
  ["configuracion/google-workspace", () => getWorkspace()],
  ["usuarios/:id/cuentas-google", () => getUserAccounts(new Request("https://example.test/api/v1/usuarios/user-2/cuentas-google"), context)]
] as const;

beforeEach(() => {
  mock.session = { user: { id: "admin-1", email: "admin@example.test", role: "ADMINISTRACION" } };
  mock.actor = { id: "admin-1", rol: "ADMINISTRACION", activo: true };
  mock.resolveSessionActor.mockReset().mockImplementation(async () => mock.actor);
  mock.workspaceFindUnique.mockReset();
  mock.workspaceFindMany.mockReset();
  mock.userFindUnique.mockReset();
  mock.payments.mockReset();
});

describe("F9: las lecturas administrativas no confían en un rol de sesión obsoleto", () => {
  for (const [route, invoke] of sensitiveReads) {
    it(`${route}: deniega un administrador degradado sin ejecutar consultas de datos`, async () => {
      mock.actor = { id: "admin-1", rol: "DOCENTE", activo: true };
      const response = await invoke() as { status: number };
      expect(response.status).toBe(403);
      expect(mock.resolveSessionActor).toHaveBeenCalledOnce();
      expect(mock.workspaceFindUnique).not.toHaveBeenCalled();
      expect(mock.workspaceFindMany).not.toHaveBeenCalled();
      expect(mock.userFindUnique).not.toHaveBeenCalled();
      expect(mock.payments).not.toHaveBeenCalled();
    });

    it(`${route}: deniega usuarios desactivados o eliminados`, async () => {
      mock.actor = { id: "admin-1", rol: "ADMINISTRACION", activo: false };
      expect((await invoke() as { status: number }).status).toBe(403);
      mock.actor = null;
      expect((await invoke() as { status: number }).status).toBe(403);
    });

    it(`${route}: no consulta la base cuando no hay sesión`, async () => {
      mock.session = null;
      expect((await invoke() as { status: number }).status).toBe(403);
      expect(mock.resolveSessionActor).not.toHaveBeenCalled();
    });
  }
});

describe("F9: administradores vigentes conservan acceso a las lecturas", () => {
  it("puede consultar el estado de Google Workspace y las cuentas de usuario", async () => {
    mock.workspaceFindUnique.mockResolvedValue(null);
    mock.workspaceFindMany.mockResolvedValue([]);
    mock.userFindUnique.mockResolvedValue({
      id: "user-2", passwordHash: null, cuentasGoogle: []
    });
    expect((await getWorkspace() as { status: number }).status).toBe(200);
    expect((await getUserAccounts(new Request("https://example.test/api/v1/usuarios/user-2/cuentas-google"), context) as { status: number }).status).toBe(200);
    expect(mock.workspaceFindUnique).toHaveBeenCalledTimes(1);
    expect(mock.userFindUnique).toHaveBeenCalledTimes(1);
  });
  it("puede descargar la planilla de pagos", async () => {
    mock.payments.mockResolvedValue([]);
    expect((await getPayments()).status).toBe(200);
    expect(mock.payments).toHaveBeenCalledTimes(1);
  });
});
