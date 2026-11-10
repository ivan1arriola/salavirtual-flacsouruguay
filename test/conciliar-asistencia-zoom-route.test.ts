/* eslint-disable @typescript-eslint/no-explicit-any */
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveSessionActor: vi.fn(),
  conciliar: vi.fn()
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: mocks.resolveSessionActor }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/zoom-asistencia.server", () => ({ conciliarAsistenciaZoom: mocks.conciliar }));

import { POST } from "../app/api/v1/reuniones/instancias/[instanciaId]/asistencia/conciliar/route";

const contexto = { params: Promise.resolve({ instanciaId: "i1" }) };
const pedir = (cuerpo: unknown) =>
  POST(new Request("http://x/api", { method: "POST", body: JSON.stringify(cuerpo) }), contexto);
const valido = { registroId: "r1", invitadoReunionId: "inv", externo: false, version: 2 };

describe("POST asistencia/conciliar", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "u", email: "a@x.com" } });
    mocks.resolveSessionActor.mockResolvedValue({ id: "u", rol: "ADMINISTRACION", activo: true });
    mocks.conciliar.mockResolvedValue({ tipo: "OK", version: 3 });
  });

  it("sin sesión: 401 y no concilia", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await pedir(valido)).status).toBe(401);
    expect(mocks.conciliar).not.toHaveBeenCalled();
  });

  it("cuerpo inválido: 400 sin llegar al caso de uso", async () => {
    for (const cuerpo of [null, {}, { ...valido, version: 0 }, { ...valido, registroId: 5 }, { ...valido, externo: "si" }]) {
      expect((await pedir(cuerpo)).status).toBe(400);
    }
    expect(mocks.conciliar).not.toHaveBeenCalled();
  });

  it("OK: 200 con la nueva versión, pasando el actor y la instancia de la URL", async () => {
    const r = await pedir(valido);
    expect(r.status).toBe(200);
    expect(await r.json()).toEqual({ version: 3 });
    expect(mocks.conciliar).toHaveBeenCalledWith({ id: "u", rol: "ADMINISTRACION" }, { ...valido, instanciaId: "i1" });
  });

  it("PROHIBIDO → 403, CONFLICTO → 409, NO_ENCONTRADO → 404, INVITADO_AJENO → 422", async () => {
    const casos: Array<[any, number]> = [
      [{ tipo: "PROHIBIDO" }, 403], [{ tipo: "CONFLICTO" }, 409],
      [{ tipo: "ERROR", codigo: "NO_ENCONTRADO" }, 404], [{ tipo: "ERROR", codigo: "INVITADO_AJENO" }, 422]
    ];
    for (const [resultado, status] of casos) {
      mocks.conciliar.mockResolvedValueOnce(resultado);
      expect((await pedir(valido)).status).toBe(status);
    }
  });

  it("una excepción devuelve 500 sin filtrar su mensaje", async () => {
    mocks.conciliar.mockRejectedValueOnce(new Error("postgres://user:clave@host/db"));
    const r = await pedir(valido);
    expect(r.status).toBe(500);
    expect(JSON.stringify(await r.json())).not.toMatch(/postgres|clave/);
  });
});
