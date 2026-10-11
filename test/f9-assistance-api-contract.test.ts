import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenApiError } from "../src/lib/http/api-error";

const mock = vi.hoisted(() => ({
  session: { user: { id: "admin-1", email: "admin@example.test" } } as { user: { id: string; email: string } } | null,
  actor: { id: "admin-1", rol: "ADMINISTRACION", activo: true },
  assign: vi.fn(),
  unassign: vi.fn(),
  sync: vi.fn()
}));
vi.mock("next/server", () => ({
  NextResponse: { json: (body: unknown, init?: { status?: number }) => ({
    body, status: init?.status ?? 200
  }) }
}));
vi.mock("@/auth", () => ({ auth: async () => mock.session }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => mock.actor
}));
vi.mock("@/src/bootstrap/asistencia.server", () => ({
  asignarAsistente: (...args: unknown[]) => mock.assign(...args),
  desvincularAsistente: (...args: unknown[]) => mock.unassign(...args),
  sincronizarAsignacionAsistente: (...args: unknown[]) => mock.sync(...args)
}));
import { POST as assign } from "../app/api/v1/asistencia/asignaciones/route";
import { POST as unassign } from "../app/api/v1/asistencia/asignaciones/desvincular/route";

type Response = { status: number; body: { error?: string; warning?: string | null } };
function request() {
  return new Request("https://example.test/api/v1/asistencia/asignaciones", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{}"
  });
}

beforeEach(() => {
  mock.session = { user: { id: "admin-1", email: "admin@example.test" } };
  mock.assign.mockReset().mockResolvedValue({ id: "assignment-1", instanciaSalaId: "meeting-1" });
  mock.unassign.mockReset().mockResolvedValue({ id: "assignment-1", instanciaSalaId: "meeting-1" });
  mock.sync.mockReset().mockResolvedValue({ calendarioAsistente: [], warning: null });
});

describe("F9: API de asignación usa códigos HTTP coherentes con Google", () => {
  it("crea en 201 si Google está sincronizado", async () => {
    expect((await assign(request()) as Response).status).toBe(201);
  });
  it("devuelve 202 si Calendar o Meet aún están pendientes", async () => {
    mock.sync.mockResolvedValueOnce({ calendarioAsistente: [], warning: "Sincronización pendiente." });
    expect((await assign(request()) as Response).status).toBe(202);
  });
  it("desvincula en 200 si Google quedó sincronizado", async () => {
    expect((await unassign(request()) as Response).status).toBe(200);
  });
  it("devuelve 202 ante desvinculación con integración pendiente", async () => {
    mock.sync.mockResolvedValueOnce({ calendarioAsistente: [], warning: "Sincronización pendiente." });
    expect((await unassign(request()) as Response).status).toBe(202);
  });
  it("distingue actor prohibido de petición mal formada", async () => {
    mock.assign.mockRejectedValueOnce(new ForbiddenApiError("Acceso denegado."));
    const response = await assign(request()) as Response;
    expect(response.status).toBe(403);
  });
  it("no expone el mensaje original de errores internos", async () => {
    mock.assign.mockRejectedValueOnce(new Error("DATABASE_URL secret connection info"));
    const response = await assign(request()) as Response;
    expect(response.status).toBe(500);
    expect(response.body.error).not.toContain("DATABASE_URL");
  });
});
