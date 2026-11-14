import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { obtenerDatosPaginaConfiguracion } from "../src/modules/configuracion/configuracion-page.service";

vi.mock("../src/modules/configuracion/google-workspace.service", () => ({
  obtenerCredencialPrincipalGoogleWorkspace: vi.fn(async () => null)
}));

const AHORA = new Date("2026-11-05T12:00:00.000Z");
const FUERA = new Date("2026-11-01T12:00:00.000Z");
const ULTIMA = new Date("2026-11-05T10:00:00.000Z");

function cuenta(id: string, tipo: "GOOGLE_MEET" | "ZOOM", extra: Record<string, unknown> = {}) {
  return {
    id,
    nombre: id,
    emailOrganizador: `${id}@flacso.edu.uy`,
    prioridad: 1,
    limiteConcurrente: 1,
    tieneLicencia: true,
    activa: true,
    secretRef: null,
    origenGrupoZoom: tipo === "ZOOM",
    fueraDelGrupoAt: null,
    proveedor: { tipo, nombre: tipo },
    _count: { eventosProveedor: 0 },
    ...extra
  };
}

function crearDb() {
  const cuentas = [
    cuenta("meet-1", "GOOGLE_MEET"),
    cuenta("zoom-dentro", "ZOOM"),
    cuenta("zoom-fuera", "ZOOM", { fueraDelGrupoAt: FUERA }),
    cuenta("zoom-inactiva", "ZOOM", { activa: false })
  ];
  const mock = {
    configuracionAsistenciaTecnica: { findUnique: vi.fn(async () => null) },
    cuentaProveedor: { findMany: vi.fn(async (_consulta: unknown) => cuentas) },
    programa: { count: vi.fn(async () => 0) },
    eventoProveedor: {
      findMany: vi.fn(async () => []),
      groupBy: vi.fn(async (_consulta: unknown) => [{ cuentaProveedorId: "zoom-fuera", _count: { _all: 2 } }])
    },
    configuracionZoom: {
      findUnique: vi.fn(async (_consulta: unknown) => ({
        grupoId: "g-1",
        grupoNombre: "Salas FLACSO",
        ultimaSincronizacionAt: ULTIMA,
        ultimaSincronizacionResultado: "1 nueva"
      }))
    }
  };
  return { mock, db: mock as unknown as PrismaClient };
}

describe("datos de Configuración › Salas", () => {
  it("lee el estado de grupo de cada cuenta y sus reuniones futuras con una sola consulta agrupada", async () => {
    const { mock, db } = crearDb();
    const datos = await obtenerDatosPaginaConfiguracion(db, "salas", AHORA);

    const consultaCuentas = mock.cuentaProveedor.findMany.mock.calls[0][0] as any;
    expect(consultaCuentas.select).toMatchObject({ fueraDelGrupoAt: true, origenGrupoZoom: true });

    expect(mock.eventoProveedor.groupBy).toHaveBeenCalledTimes(1);
    const consulta = mock.eventoProveedor.groupBy.mock.calls[0][0] as any;
    expect(consulta.by).toEqual(["cuentaProveedorId"]);
    expect(consulta.where.proveedor).toEqual({ tipo: "ZOOM" });
    expect(consulta.where.instancia).toMatchObject({
      OR: [{ estado: "PROGRAMADA", finProgramadoAt: { gt: AHORA } }, { estado: "EN_CURSO" }]
    });

    expect(datos.hosts.map(({ id, reunionesFuturas }) => [id, reunionesFuturas])).toEqual([
      ["meet-1", 0],
      ["zoom-dentro", 0],
      ["zoom-fuera", 2],
      ["zoom-inactiva", 0]
    ]);
    expect(datos.zoomGrupo).toEqual({
      grupoId: "g-1",
      grupoNombre: "Salas FLACSO",
      ultimaSincronizacionAt: ULTIMA,
      ultimaSincronizacionResultado: "1 nueva"
    });
  });

  it("las cuentas fuera del grupo no cuentan como disponibles", async () => {
    const { db } = crearDb();
    const datos = await obtenerDatosPaginaConfiguracion(db, "salas", AHORA);
    expect(datos.availableHosts).toBe(2);
    expect(datos.zoomAvailableHosts).toBe(1);
  });

  it("fuera de la sección Salas no consulta reuniones futuras ni el grupo de Zoom", async () => {
    const { mock, db } = crearDb();
    const datos = await obtenerDatosPaginaConfiguracion(db, "resumen", AHORA);
    expect(mock.eventoProveedor.groupBy).not.toHaveBeenCalled();
    expect(mock.configuracionZoom.findUnique).not.toHaveBeenCalled();
    expect(datos.zoomGrupo).toBeNull();
    expect(datos.availableHosts).toBe(2);
  });
});
