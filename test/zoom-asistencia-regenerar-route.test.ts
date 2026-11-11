/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ actor: null as any, findFirst: vi.fn(), regenerar: vi.fn(), sync: vi.fn() }));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: { status?: number }) => ({ body, status: init?.status ?? 200 }) } }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "u1", email: "a@x.test" } }) }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: async () => mock.actor }));
vi.mock("@/src/lib/db", () => ({ db: { eventoProveedor: { findFirst: (...a: unknown[]) => mock.findFirst(...a) } } }));
vi.mock("@/src/bootstrap/archivos.server", () => ({ sincronizarArtefactos: (...a: unknown[]) => mock.sync(...a) }));
vi.mock("@/src/bootstrap/zoom-asistencia.server", () => ({ regenerarAsistenciaInstanciaZoom: (...a: unknown[]) => mock.regenerar(...a) }));
import { POST } from "../app/api/v1/reuniones/instancias/[instanciaId]/asistencia/regenerar/route";

const ctx = { params: Promise.resolve({ instanciaId: "i1" }) };
const llamar = () => POST(new Request("https://x.test"), ctx) as Promise<{ status: number; body: any }>;

describe("regeneración de asistencia de un encuentro Zoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.actor = { id: "u1", rol: "ADMINISTRACION", activo: true };
  });

  it("sin encuentro Meet usa el flujo Zoom y no toca la sincronización de Meet", async () => {
    mock.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "z1" });
    mock.regenerar.mockResolvedValue({ ocurrencias: 1, resultados: [{ sincronizacion: { tipo: "OK" }, planilla: { tipo: "ERROR", codigo: "ERROR_DRIVE" } }] });
    const r = await llamar();
    expect(r.status).toBe(200);
    expect(mock.sync).not.toHaveBeenCalled();
    expect(r.body.resultados[0]).toEqual({ sincronizacion: "OK", planilla: "ERROR", codigoPlanilla: "ERROR_DRIVE" });
  });

  it("un fallo de planilla no oculta que la asistencia se sincronizó (pasos independientes)", async () => {
    mock.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce({ id: "z1" });
    mock.regenerar.mockResolvedValue({ ocurrencias: 1, resultados: [{ sincronizacion: { tipo: "OK" }, planilla: { tipo: "ERROR", codigo: "X" } }] });
    expect((await llamar()).body.resultados[0].sincronizacion).toBe("OK");
  });

  it("solo administración; sin encuentro Meet ni Zoom: 404", async () => {
    mock.actor = { id: "u1", rol: "DOCENTE", activo: true };
    expect((await llamar()).status).toBe(403);
    expect(mock.regenerar).not.toHaveBeenCalled();
    mock.actor = { id: "u1", rol: "ADMINISTRACION", activo: true };
    mock.findFirst.mockResolvedValue(null);
    expect((await llamar()).status).toBe(404);
  });
});
