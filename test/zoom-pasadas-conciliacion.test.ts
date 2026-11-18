import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), resolve: vi.fn(), desvincular: vi.fn() }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: mocks.resolve }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/zoom-historico.server", () => ({
  desvincularOcurrenciaZoomAdmin: mocks.desvincular
}));

import { POST } from "../app/api/v1/archivos/zoom/ocurrencias/[ocurrenciaId]/desvincular/route";
import { desvincularOcurrenciaZoom } from "../src/modules/archivos/application";

const req = (c: unknown) => new Request("https://x", { method: "POST", body: JSON.stringify(c) });
const ctx = { params: Promise.resolve({ ocurrenciaId: "o1" }) };
const leer = (r: string) => readFileSync(r, "utf8");

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ user: { id: "u", email: "a@x" } });
  mocks.resolve.mockResolvedValue({ id: "u", rol: "ADMINISTRACION", activo: true });
});

describe("POST desvincular", () => {
  it("solo ADMINISTRACION", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await POST(req({ eventoId: "e" }), ctx)).status).toBe(401);
    for (const rol of ["DOCENTE", "ASISTENTE_TECNICO"]) {
      mocks.resolve.mockResolvedValueOnce({ id: "u", rol, activo: true });
      expect((await POST(req({ eventoId: "e" }), ctx)).status).toBe(403);
    }
    expect(mocks.desvincular).not.toHaveBeenCalled();
  });

  it("valida el cuerpo y mapea resultados", async () => {
    expect((await POST(req({}), ctx)).status).toBe(400);
    mocks.desvincular.mockResolvedValueOnce({ tipo: "DESVINCULADA", referenciasEliminadas: 2 });
    expect((await POST(req({ eventoId: "e" }), ctx)).status).toBe(200);
    mocks.desvincular.mockResolvedValueOnce({ tipo: "NO_VINCULADA" });
    expect((await POST(req({ eventoId: "e" }), ctx)).status).toBe(409);
    mocks.desvincular.mockResolvedValueOnce({ tipo: "NO_ENCONTRADA" });
    expect((await POST(req({ eventoId: "e" }), ctx)).status).toBe(404);
  });
});

describe("caso de uso desvincularOcurrenciaZoom", () => {
  it("rechaza a quien no administra sin tocar el repositorio", async () => {
    const repo = { desvincularOcurrencia: vi.fn() };
    expect(await desvincularOcurrenciaZoom({ repo }, { id: "u", rol: "DOCENTE" }, "o", "e")).toEqual({
      tipo: "PROHIBIDO"
    });
    expect(repo.desvincularOcurrencia).not.toHaveBeenCalled();
  });
});

describe("conciliación en la vista pasadas (fuente)", () => {
  const comp = leer("src/components/zoom-pasada-acciones.tsx");
  const pagina =
    leer("app/(gestion)/centro-operaciones/zoom/page.tsx") +
    leer("app/(gestion)/centro-operaciones/zoom/pasadas-conciliacion.tsx");
  it("pide confirmación y refresca", () => {
    expect(comp).toMatch(/window\.confirm/);
    expect(comp).toMatch(/router\.refresh\(\)/);
    expect(comp).toMatch(/aria-live="polite"/);
  });
  it("la página lista sin vincular y reutiliza el control de vínculo", () => {
    expect(pagina).toMatch(/datos\.sinVincular/);
    expect(pagina).toMatch(/<ZoomHistoricoControl ocurrenciaId/);
    expect(pagina).not.toMatch(/Esta página es de\s+solo lectura/);
  });
  it("los controles miden 44px", () => {
    expect(leer("app/(gestion)/centro-operaciones/zoom/zoom.module.css")).toMatch(/min-height: 44px/);
  });
});
