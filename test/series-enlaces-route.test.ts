import { beforeEach, describe, expect, it, vi } from "vitest";
import { ForbiddenApiError } from "../src/lib/http/api-error";

const state = vi.hoisted(() => ({
  session: null as null | { user: { id: string; email: string; role: string } },
  actor: null as null | { id: string; rol: string; activo: boolean },
  detectar: vi.fn(),
  corregir: vi.fn(),
  limpiar: vi.fn(),
}));

vi.mock("next/server", () => ({
  NextResponse: class {
    constructor(
      public body: unknown,
      public status = 200,
    ) {}
    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init?.status ?? 200);
    }
  },
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => state.actor,
}));
vi.mock("@/src/lib/db", () => ({
  db: {
    cuentaProveedor: { findMany: async () => [{ id: "h1", prioridad: 1, limiteConcurrente: 1 }] },
    eventoProveedor: { findMany: async () => [] },
    instanciaSala: {
      findMany: async () => [{ id: "i1", finProgramadoAt: new Date("2030-01-01T11:00:00Z") }],
    },
  },
}));
vi.mock("@/src/bootstrap/migracion-zoom.server", () => ({
  crearDependenciasCorreccionSerie: () => ({ deps: true }),
}));
vi.mock("@/src/modules/reuniones/migracion-zoom-aplicar.service", () => ({
  MARGEN_SEGURIDAD_HORAS_APLICAR: 24,
}));
vi.mock("@/src/modules/reuniones/series-enlaces-distintos.service", () => ({
  detectarSeriesConEnlacesDistintos: state.detectar,
}));
vi.mock("@/src/modules/reuniones/corregir-serie-enlaces.service", () => ({
  corregirSeriesEnlaces: state.corregir,
  limpiarReunionesAntiguas: state.limpiar,
  MAXIMO_LOTE_CORRECCION_SERIE: 5,
}));

import { GET, POST } from "../app/api/v1/reuniones/migracion-zoom/series-enlaces/route";

const post = (body: unknown) =>
  new Request("http://localhost/x", { method: "POST", body: JSON.stringify(body) });
const forbidden = () => new ForbiddenApiError("Solo Administración");

beforeEach(() => {
  state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
  state.actor = { id: "u", rol: "ADMINISTRACION", activo: true };
  state.detectar.mockReset().mockResolvedValue([]);
  state.corregir.mockReset().mockResolvedValue([{ serieClave: "serie:s", resultado: "CORREGIDA" }]);
  state.limpiar.mockReset().mockResolvedValue({ eliminadas: 2, pendientes: 1, errores: 0 });
});

describe("ruta de corrección de series con enlaces distintos", () => {
  it("responde 401 sin sesión o con usuario inactivo", async () => {
    state.session = null;
    expect(((await GET()) as any).status).toBe(401);
    expect(((await POST(post({ modo: "PILOTO", serieClaves: ["serie:s"] }))) as any).status).toBe(
      401,
    );
    state.session = { user: { id: "u", email: "a@flacso.edu.uy", role: "ADMINISTRACION" } };
    state.actor = { id: "u", rol: "ADMINISTRACION", activo: false };
    expect(((await POST(post({ accion: "LIMPIAR" }))) as any).status).toBe(401);
    expect(state.corregir).not.toHaveBeenCalled();
    expect(state.limpiar).not.toHaveBeenCalled();
  });

  it("GET devuelve la detección y los planes sin escribir; un no administrador recibe 403", async () => {
    state.detectar.mockResolvedValue([
      {
        serieClave: "serie:s",
        titulo: "T",
        programa: "P",
        docente: "D",
        enlacesDistintos: 2,
        cuentasDistintas: 1,
        encuentros: [
          {
            instanciaId: "i1",
            inicio: new Date("2030-01-01T10:00:00Z"),
            joinUrl: "u1",
            externalEventId: "1",
            cuentaProveedorId: "h1",
          },
        ],
      },
    ]);
    const res = (await GET()) as any;
    expect(res.status).toBe(200);
    expect(res.body.series).toHaveLength(1);
    expect(res.body.planes["serie:s"]).toMatchObject({
      estado: "CORREGIBLE",
      hostId: "h1",
      reunionesARetirar: ["1"],
    });
    expect(res.body.planes["serie:s"]).not.toHaveProperty("encuentrosSinCalendar");
    state.detectar.mockRejectedValue(forbidden());
    expect(((await GET()) as any).status).toBe(403);
  });

  it("POST valida el cuerpo: modo y claves, lote de hasta 5", async () => {
    expect(((await POST(post({ modo: "TODO", serieClaves: ["serie:s"] }))) as any).status).toBe(
      400,
    );
    expect(((await POST(post({ modo: "LOTE", serieClaves: [] }))) as any).status).toBe(400);
    expect(
      (
        (await POST(
          post({ modo: "LOTE", serieClaves: Array.from({ length: 6 }, (_, i) => `serie:${i}`) }),
        )) as any
      ).status,
    ).toBe(400);
    expect(((await POST(post(null))) as any).status).toBe(400);
    expect(state.corregir).not.toHaveBeenCalled();
  });

  it("POST delega la corrección con el actor y devuelve resultados por serie", async () => {
    const res = (await POST(post({ modo: "PILOTO", serieClaves: ["serie:s"] }))) as any;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ resultados: [{ serieClave: "serie:s", resultado: "CORREGIDA" }] });
    expect(state.corregir).toHaveBeenCalledWith(
      { deps: true },
      { id: "u", rol: "ADMINISTRACION" },
      { modo: "PILOTO", serieClaves: ["serie:s"] },
    );
  });

  it("POST LIMPIAR invoca la limpieza sin series y un no administrador recibe 403", async () => {
    const res = (await POST(post({ accion: "LIMPIAR" }))) as any;
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ limpieza: { eliminadas: 2, pendientes: 1, errores: 0 } });
    expect(state.corregir).not.toHaveBeenCalled();
    state.limpiar.mockRejectedValue(forbidden());
    expect(((await POST(post({ accion: "LIMPIAR" }))) as any).status).toBe(403);
  });
});
