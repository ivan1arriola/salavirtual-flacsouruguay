import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  resolveSessionActor: vi.fn(),
  puedeGestionarPrograma: vi.fn(),
  cargar: vi.fn(),
  instancia: vi.fn(),
  leerPlanilla: vi.fn(),
  crearJwt: vi.fn()
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/src/lib/db", () => ({ db: { instanciaSala: { findUnique: mocks.instancia } } }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: mocks.resolveSessionActor }));
vi.mock("@/src/lib/config/encryption", () => ({ descifrarConfiguracion: (v: string) => v }));
vi.mock("@/src/integrations/google", () => ({ crearGoogleAuthJwt: mocks.crearJwt }));
vi.mock("@/src/bootstrap/archivos.server", () => ({
  crearArchivosRepository: () => ({ obtenerConfiguracionWorkspacePrincipal: vi.fn() })
}));
vi.mock("@/src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: mocks.puedeGestionarPrograma
}));
vi.mock("@/src/modules/archivos/infrastructure/google/google-attendance-sheet-reader.client", () => ({
  leerPlanillaAsistenciaGoogle: mocks.leerPlanilla
}));
vi.mock("@/src/modules/archivos/infrastructure/prisma/prisma-lectura-planilla-zoom.adapter", () => ({
  crearPrismaLecturaPlanillaZoomAdapter: () => ({ cargarAsistenciaInstancia: mocks.cargar })
}));

import { GET } from "../app/api/v1/reuniones/instancias/[instanciaId]/asistencia/exportar/[fuente]/route";

const pedir = (fuente: string, query = "") =>
  GET(new Request(`http://x/api${query}`), { params: Promise.resolve({ instanciaId: "i1", fuente }) });
const t = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
const registro = {
  nombre: "=Ana",
  emailObservado: "ana@gmail.com",
  emailConfirmado: null,
  primeraEntradaAt: t("13:00"),
  ultimaSalidaAt: t("13:30"),
  minutos: 30,
  porcentaje: 50,
  sesiones: 1,
  estadoConciliacion: "SIN_CONCILIAR",
  rolComprobado: null
};

describe("exportación de asistencia Zoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "u", email: "docente@x.com" } });
    mocks.resolveSessionActor.mockResolvedValue({ id: "u", rol: "DOCENTE", activo: true });
    mocks.puedeGestionarPrograma.mockResolvedValue(true);
    mocks.instancia.mockResolvedValue({
      inicioProgramadoAt: t("13:00"),
      finProgramadoAt: t("14:00"),
      solicitud: { docentePrograma: { programaId: "p1" } },
      eventosProveedor: []
    });
    mocks.cargar.mockResolvedValue({ registros: [registro], sesiones: [] });
  });

  it("sirve el CSV desde la base a un usuario sin Workspace, sin tocar Google", async () => {
    const r = await pedir("zoom");
    expect(r.status).toBe(200);
    expect(r.headers.get("Content-Disposition")).toMatch(/_zoom_resumen\.csv/);
    const cuerpo = await r.text();
    expect(cuerpo).toContain("Participante");
    expect(cuerpo).toContain("'=Ana");
    expect(mocks.crearJwt).not.toHaveBeenCalled();
    expect(mocks.leerPlanilla).not.toHaveBeenCalled();
  });

  it("separa sesiones originales de resumen consolidado con el parámetro conjunto", async () => {
    mocks.cargar.mockResolvedValue({
      registros: [registro],
      sesiones: [
        {
          nombre: "Ana",
          email: null,
          entradaAt: t("13:00"),
          salidaAt: t("13:10"),
          status: "in_meeting",
          participanteId: "p"
        }
      ]
    });
    const r = await pedir("zoom", "?conjunto=sesiones&formato=json");
    expect(r.status).toBe(200);
    const json = await r.json();
    expect(json).toMatchObject({ fuente: "zoom", conjunto: "sesiones", origenDatos: "base_de_datos" });
    expect(json.columnas).toContain("Entrada (UTC)");
  });

  it("sin permiso sobre el programa: 404 sin revelar la existencia del encuentro", async () => {
    mocks.puedeGestionarPrograma.mockResolvedValue(false);
    expect((await pedir("zoom")).status).toBe(404);
    expect(mocks.cargar).not.toHaveBeenCalled();
  });

  it("sin sesión 401; fuentes, formatos y conjuntos inválidos 400", async () => {
    mocks.auth.mockResolvedValueOnce(null);
    expect((await pedir("zoom")).status).toBe(401);
    expect((await pedir("otra")).status).toBe(400);
    expect((await pedir("zoom", "?formato=xml")).status).toBe(400);
    expect((await pedir("zoom", "?conjunto=todo")).status).toBe(400);
  });

  it("sin registros no exporta una lista vacía como prueba de cero asistentes", async () => {
    mocks.cargar.mockResolvedValue({ registros: [], sesiones: [] });
    const r = await pedir("zoom");
    expect(r.status).toBe(409);
    expect(JSON.stringify(await r.json())).toMatch(/no demuestra ausencia/);
  });

  it("un fallo interno devuelve 502 genérico, sin datos personales", async () => {
    mocks.cargar.mockRejectedValue(new Error("ana@gmail.com postgres://x"));
    const r = await pedir("zoom");
    expect(r.status).toBe(502);
    expect(JSON.stringify(await r.json())).not.toMatch(/ana@|postgres/);
  });
});

describe("reporte procesado: mismos permisos que el JSON original", () => {
  it.each(["resumen", "sesiones"])("sin permiso sobre el programa el conjunto %s no se sirve", async (c) => {
    mocks.puedeGestionarPrograma.mockResolvedValue(false);
    expect((await pedir("zoom", `?formato=csv&conjunto=${c}`)).status).toBe(404);
    expect(mocks.cargar).not.toHaveBeenCalled();
  });

  it("ambas rutas se protegen con sesión, actor activo y puedeGestionarPrograma", () => {
    const base = "app/api/v1/reuniones/instancias/[instanciaId]/asistencia";
    for (const ruta of [
      `${base}/exportar/[fuente]/route.ts`,
      `${base}/zoom-original/[ocurrenciaId]/route.ts`
    ]) {
      const fuente = readFileSync(ruta, "utf8");
      expect(fuente).toMatch(/await auth\(\)/);
      expect(fuente).toMatch(/actor\?\.activo/);
      expect(fuente).toMatch(/puedeGestionarPrograma/);
    }
  });
});
