import { beforeEach, describe, expect, it, vi } from "vitest";
import { consultarEstadoZoomArchivosUseCase } from "../src/modules/archivos/application";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), resolveSessionActor: vi.fn(), meet: vi.fn(), zoom: vi.fn()
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: mocks.resolveSessionActor }));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/archivos.server", () => ({ sincronizarArtefactosOperativos: mocks.meet }));
vi.mock("@/src/bootstrap/zoom-historico.server", () => ({ estadoZoomArchivos: mocks.zoom }));

import { GET, POST } from "../app/api/v1/reuniones/sincronizar-archivos/route";

const meetOk = { resultados: [{ estado: "SINCRONIZADO", grabacion: "PENDIENTE", archivos: 2 }], timestamp: "t", ventanas: 1 };
const zoomOk = { disponible: true, pendientes: 3 };
const get = (secret?: string) => GET(new Request("http://x", { headers: secret ? { authorization: `Bearer ${secret}` } : {} }));

beforeEach(() => {
  vi.clearAllMocks();
  process.env.CRON_SECRET = "s";
  mocks.auth.mockResolvedValue({ user: { id: "u", email: "a@x.com" } });
  mocks.resolveSessionActor.mockResolvedValue({ id: "u", rol: "ADMINISTRACION", activo: true });
  mocks.meet.mockResolvedValue(meetOk);
  mocks.zoom.mockResolvedValue(zoomOk);
});

describe("sincronizar-archivos con estado de Zoom", () => {
  it("conserva la autenticación: sin secreto 401, secreto correcto 200", async () => {
    expect((await get()).status).toBe(401);
    expect((await get("mal")).status).toBe(401);
    expect(mocks.meet).not.toHaveBeenCalled();
    expect((await get("s")).status).toBe(200);
  });

  it("mantiene el resultado de Meet compatible y agrega el estado de Zoom sin esperar descargas", async () => {
    const cuerpo = await (await get("s")).json();
    expect(cuerpo).toMatchObject({ procesadas: 1, sincronizadas: 1, grabacionesPendientes: 1, archivos: 2, zoom: zoomOk });
  });

  it("un fallo de Zoom no impide el resultado de Meet", async () => {
    mocks.zoom.mockRejectedValueOnce(new Error("secreto interno"));
    const r = await get("s");
    expect(r.status).toBe(200);
    const cuerpo = await r.json();
    expect(cuerpo.procesadas).toBe(1);
    expect(cuerpo.zoom).toEqual({ disponible: false });
    expect(JSON.stringify(cuerpo)).not.toContain("secreto");
  });

  it("un fallo de Meet no impide informar Zoom y responde 502", async () => {
    mocks.meet.mockRejectedValueOnce(new Error("meet caído"));
    const r = await get("s");
    expect(r.status).toBe(502);
    expect((await r.json()).zoom).toEqual(zoomOk);
  });

  it("POST con sesión de un docente sin permiso: 403 y no se ejecuta nada", async () => {
    mocks.resolveSessionActor.mockResolvedValue({ id: "u", rol: "ASISTENTE_TECNICO", activo: true });
    expect((await POST()).status).toBe(403);
    expect(mocks.meet).not.toHaveBeenCalled();
    expect(mocks.zoom).not.toHaveBeenCalled();
  });
});

describe("consultarEstadoZoomArchivosUseCase", () => {
  const ahora = new Date("2026-11-10T12:00:00Z");
  const base = { porEstado: { PENDIENTE: 2, CONSERVADO: 5 }, pendienteMasViejoAt: new Date("2026-11-10T11:00:00Z"), fallosCapacidad: 1, ultimaActividadAt: new Date("2026-11-10T11:59:00Z"), barridosActivos: 1 };

  it("calcula la antigüedad del pendiente más viejo y la inactividad del worker", async () => {
    const r = await consultarEstadoZoomArchivosUseCase({ leerEstado: async () => base }, ahora);
    expect(r).toMatchObject({ pendientes: 2, conservados: 5, antiguedadPendienteSegundos: 3600, segundosDesdeUltimaActividad: 60, fallosCapacidad: 1, barridosActivos: 1 });
  });

  it("sin pendientes la antigüedad es null", async () => {
    const r = await consultarEstadoZoomArchivosUseCase({ leerEstado: async () => ({ ...base, pendienteMasViejoAt: null, porEstado: {} }) }, ahora);
    expect(r.antiguedadPendienteSegundos).toBeNull();
    expect(r.pendientes).toBe(0);
  });
});
