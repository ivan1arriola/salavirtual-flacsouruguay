import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  actor: vi.fn(),
  instancia: vi.fn(),
  permiso: vi.fn(),
  credenciales: vi.fn(),
  token: vi.fn()
}));

vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: mocks.actor }));
vi.mock("@/src/lib/db", () => ({ db: { instanciaSala: { findUnique: mocks.instancia } } }));
vi.mock("@/src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: mocks.permiso
}));
vi.mock("@/src/modules/configuracion/zoom-config.service", () => ({
  obtenerCredencialesZoom: mocks.credenciales
}));
vi.mock("@/src/integrations/zoom/zoom-client", () => ({ crearProveedorTokenZoom: mocks.token }));

import { GET } from "../app/api/v1/reuniones/instancias/[instanciaId]/participantes-zoom/route";

const contexto = { params: Promise.resolve({ instanciaId: "instancia-1" }) };
const pedir = () => GET(new Request("http://localhost/api"), contexto);

describe("participantes Zoom en vivo para docentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: "docente-1" } });
    mocks.actor.mockResolvedValue({ id: "docente-1", rol: "DOCENTE", activo: true });
    mocks.permiso.mockResolvedValue(true);
    mocks.instancia.mockResolvedValue({
      estado: "PROGRAMADA",
      inicioProgramadoAt: new Date(Date.now() - 1000),
      finProgramadoAt: new Date(Date.now() + 3600000),
      proveedorActivoTipo: "ZOOM",
      solicitud: { docentePrograma: { programaId: "programa-1" } },
      eventosProveedor: [{ proveedor: { tipo: "ZOOM" }, codigoReunion: "123456" }]
    });
    mocks.credenciales.mockResolvedValue({ disponible: false });
  });

  it("rechaza sesiones ajenas antes de consultar la clase", async () => {
    mocks.auth.mockResolvedValue(null);
    expect((await pedir()).status).toBe(401);
    expect(mocks.instancia).not.toHaveBeenCalled();
  });

  it("no expone participantes a docentes de otros programas", async () => {
    mocks.permiso.mockResolvedValue(false);
    const response = await pedir();
    expect(response.status).toBe(403);
    expect(mocks.credenciales).not.toHaveBeenCalled();
    expect(mocks.permiso).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ id: "docente-1" }),
      "programa-1"
    );
  });

  it("separa una clase sin Zoom activo y evita llamadas externas", async () => {
    mocks.instancia.mockResolvedValueOnce({
      estado: "PROGRAMADA",
      inicioProgramadoAt: new Date(Date.now() - 1000),
      finProgramadoAt: new Date(Date.now() + 3600000),
      proveedorActivoTipo: "GOOGLE_MEET",
      solicitud: { docentePrograma: { programaId: "programa-1" } },
      eventosProveedor: [{ proveedor: { tipo: "GOOGLE_MEET" }, codigoReunion: null }]
    });
    const response = await pedir();
    expect((await response.json()).estado).toBe("NO_DISPONIBLE");
    expect(mocks.credenciales).not.toHaveBeenCalled();
  });
});
