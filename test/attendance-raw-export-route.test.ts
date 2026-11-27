import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  session: { user: { id: "user-1", email: "admin@example.org" } },
  actor: { id: "user-1", activo: true, rol: "ADMINISTRACION" },
  findUnique: vi.fn(),
  canAccess: vi.fn(),
  config: vi.fn(),
  readSheet: vi.fn(),
  jwt: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number; headers?: Record<string, string> }) =>
      new Response(JSON.stringify(body), { status: init?.status ?? 200, headers: init?.headers }),
  },
}));
vi.mock("@/auth", () => ({ auth: async () => mocks.session }));
vi.mock("@/src/lib/db", () => ({
  db: { instanciaSala: { findUnique: (...args: unknown[]) => mocks.findUnique(...args) } },
}));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => mocks.actor,
}));
vi.mock("@/src/lib/config/encryption", () => ({ descifrarConfiguracion: () => "private" }));
vi.mock("@/src/bootstrap/archivos.server", () => ({
  crearArchivosRepository: () => ({ obtenerConfiguracionWorkspacePrincipal: () => mocks.config() }),
}));
vi.mock("@/src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: (...args: unknown[]) => mocks.canAccess(...args),
}));
vi.mock("@/src/integrations/google", () => ({
  crearGoogleAuthJwt: (...args: unknown[]) => mocks.jwt(...args),
  conReintentosGoogleLectura: vi.fn(),
}));
vi.mock(
  "@/src/modules/archivos/infrastructure/google/google-attendance-sheet-reader.client",
  () => ({
    leerPlanillaAsistenciaGoogle: (...args: unknown[]) => mocks.readSheet(...args),
  }),
);

import { GET } from "../app/api/v1/reuniones/instancias/[instanciaId]/asistencia/exportar/[fuente]/route";

const url = (fuente: string, formato = "csv") =>
  new Request(
    `https://flacso.test/api/v1/reuniones/instancias/inst-1/asistencia/exportar/${fuente}?formato=${formato}`,
  );
const ctx = (fuente: string) => ({ params: Promise.resolve({ instanciaId: "inst-1", fuente }) });

beforeEach(() => {
  vi.clearAllMocks();
  mocks.session = { user: { id: "user-1", email: "admin@example.org" } };
  mocks.actor = { id: "user-1", activo: true, rol: "ADMINISTRACION" };
  mocks.findUnique.mockResolvedValue({
    inicioProgramadoAt: new Date("2026-10-21T12:00:00.000Z"),
    finProgramadoAt: new Date("2026-10-21T13:00:00.000Z"),
    solicitud: { docentePrograma: { programaId: "programa-1" } },
    eventosProveedor: [
      {
        codigoReunion: "abc-def-ghi",
        cuentaProveedor: { emailOrganizador: "host@flacso.edu.uy" },
        archivos: [{ driveFileId: "sheet-1", mimeType: "application/vnd.google-apps.spreadsheet" }],
      },
    ],
  });
  mocks.canAccess.mockResolvedValue(true);
  mocks.jwt.mockReturnValue({});
  mocks.config.mockResolvedValue({
    activa: true,
    serviceAccountEmail: "service@example.org",
    privateKeyCifrada: "encrypted",
  });
  mocks.readSheet.mockResolvedValue({
    asistencia: [],
    responsables: [],
    datosBrutos: [
      ["Fuente"],
      [
        "MEET",
        "Alumno",
        "",
        "participants/p1",
        "",
        "2026-10-21T12:00:00Z",
        "2026-10-21T12:20:00Z",
        1200,
        "conf-1",
        "session-1",
      ],
      [
        "REPORTS",
        "Alumno",
        "alumno@example.org",
        "alumno@example.org",
        "email_address",
        "2026-10-21T12:00:00Z",
        "2026-10-21T12:30:00Z",
        1800,
        "audit",
        "endpoint",
      ],
    ],
  });
});

describe("descargas por encuentro y API", () => {
  it("exige sesión antes de buscar un encuentro", async () => {
    mocks.session = null;
    const res = await GET(url("meet"), ctx("meet"));
    expect(res.status).toBe(401);
    expect(mocks.findUnique).not.toHaveBeenCalled();
  });

  it("oculta reuniones de programas no autorizados sin leer datos de Google", async () => {
    mocks.canAccess.mockResolvedValue(false);
    const res = await GET(url("meet"), ctx("meet"));
    expect(res.status).toBe(404);
    expect(mocks.readSheet).not.toHaveBeenCalled();
  });

  it("descarga las filas Meet y nunca incluye datos Reports", async () => {
    const res = await GET(url("meet"), ctx("meet"));
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/csv");
    expect(res.headers.get("content-disposition")).toMatch(
      /attachment; filename="asistencia_\d+_inst-1_meet.csv"/,
    );
    expect(res.headers.get("cache-control")).toContain("no-store");
    const body = await res.text();
    expect(body).toContain("participants/p1");
    expect(body).not.toContain("alumno@example.org");
    expect(mocks.canAccess).toHaveBeenCalled();
    expect(mocks.readSheet).toHaveBeenCalledWith(expect.anything(), "sheet-1");
  });

  it("permite a quien está autorizado exportar Reports JSON con su identificación original", async () => {
    mocks.actor = { id: "doc-1", rol: "DOCENTE", activo: true };
    const res = await GET(url("reports", "json"), ctx("reports"));
    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.fuente).toBe("reports");
    expect(json.origenDatos).toBe("ultima_planilla_sincronizada");
    expect(json.registros).toHaveLength(1);
    expect(json.registros[0][3]).toBe("alumno@example.org");
    expect(JSON.stringify(json)).not.toContain("participants/p1");
  });

  it("rechaza formatos inválidos y ausencia de registros sin inventar asistencia", async () => {
    expect((await GET(url("reports", "xlsx"), ctx("reports"))).status).toBe(400);
    mocks.readSheet.mockResolvedValue({
      asistencia: [],
      responsables: [],
      datosBrutos: [["Fuente"], ["MEET", "Alumno"]],
    });
    const res = await GET(url("reports"), ctx("reports"));
    expect(res.status).toBe(409);
    expect((await res.json()).error).toContain("no demuestra ausencia");
  });

  it("no admite identificadores de hojas elegidos desde el navegador", async () => {
    const response = await GET(
      new Request(
        "https://flacso.test/api/v1/reuniones/instancias/inst-1/asistencia/exportar/meet?spreadsheetId=other",
      ),
      ctx("meet"),
    );
    expect(response.status).toBe(200);
    expect(mocks.readSheet).toHaveBeenCalledWith(expect.anything(), "sheet-1");
  });
});
