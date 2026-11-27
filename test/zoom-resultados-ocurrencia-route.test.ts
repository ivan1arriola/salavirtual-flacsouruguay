import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  buscar: vi.fn(),
  gestionar: vi.fn(),
  descargar: vi.fn(),
  detalle: vi.fn(),
  grabacion: vi.fn(),
}));

vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "docente" } }) }));
vi.mock("@/src/lib/db", () => ({ db: { ocurrenciaArchivoZoom: { findFirst: mocks.buscar } } }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => ({ id: "docente", rol: "DOCENTE", activo: true }),
}));
vi.mock("@/src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: mocks.gestionar,
}));
vi.mock("@/src/modules/configuracion/zoom-config.service", () => ({
  obtenerCredencialesZoom: async () => ({ disponible: true }),
}));
vi.mock("@/src/integrations/zoom/zoom-client", () => ({
  crearProveedorTokenZoom: () => ({ obtener: async () => "token" }),
}));
vi.mock("@/src/integrations/zoom/zoom-reports.client", () => ({
  descargarAsistenciaOriginalZoom: mocks.descargar,
}));
vi.mock("@/src/integrations/zoom/zoom-operations.client", () => ({
  consultarGrabacionOcurrenciaZoom: mocks.grabacion,
  obtenerDetalleReunionPasadaZoom: mocks.detalle,
}));

import { GET } from "../app/api/v1/reuniones/instancias/[instanciaId]/asistencia/original-zoom/[ocurrenciaId]/route";

const pedir = (consulta = "") =>
  GET(new Request(`http://local/api${consulta}`), {
    params: Promise.resolve({ instanciaId: "encuentro", ocurrenciaId: "ocurrencia" }),
  });

describe("resultados de una ejecución de Zoom", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.gestionar.mockResolvedValue(true);
    mocks.buscar.mockResolvedValue({
      uuid: "uuid/real",
      eventoProveedor: {
        instancia: {
          solicitud: { docentePrograma: { programaId: "programa" } },
          asignaciones: [],
        },
      },
    });
  });

  it("descarga el JSON original por UUID solo tras comprobar la vinculación y el acceso", async () => {
    const original = '{ "participants": [], "page_count": 1 }';
    mocks.descargar.mockResolvedValue(original);
    const response = await pedir();
    expect(response.status).toBe(200);
    expect(await response.text()).toBe(original);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(mocks.descargar).toHaveBeenCalledWith("token", "uuid/real");
    expect(mocks.buscar).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "ocurrencia",
          eventoProveedor: { instanciaSalaId: "encuentro", proveedor: { tipo: "ZOOM" } },
        },
      }),
    );
  });

  it("impide consultar Zoom para un programa ajeno", async () => {
    mocks.gestionar.mockResolvedValue(false);
    expect((await pedir()).status).toBe(404);
    expect(mocks.descargar).not.toHaveBeenCalled();
    expect(mocks.detalle).not.toHaveBeenCalled();
  });

  it("usa los horarios reales de Zoom para calcular la duración y confirma una ausencia antigua", async () => {
    mocks.detalle.mockResolvedValue({
      inicio: new Date("2020-01-01T12:00:00Z"),
      fin: new Date("2020-01-01T12:24:09Z"),
      duracionMinutos: 45,
    });
    mocks.grabacion.mockResolvedValue("SIN_ARCHIVOS");
    const response = await pedir("?detalle=1");
    expect(await response.json()).toMatchObject({
      duracionSegundos: 1449,
      estadoGrabacion: "SIN_ARCHIVOS",
    });
  });
});
