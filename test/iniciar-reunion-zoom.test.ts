import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { obtenerEnlaceInicioZoom } from "../src/modules/reuniones/iniciar-reunion-zoom.service";

vi.mock("../src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: vi.fn(async () => true)
}));

const manana = new Date(Date.now() + 24 * 60 * 60 * 1000);
const ayer = new Date(Date.now() - 24 * 60 * 60 * 1000);

function instancia(extra: Record<string, unknown> = {}) {
  return {
    estado: "PROGRAMADA",
    finProgramadoAt: manana,
    proveedorActivoTipo: "ZOOM",
    eventosProveedor: [
      { externalEventId: "999", proveedor: { tipo: "GOOGLE_MEET" } },
      { externalEventId: "123", proveedor: { tipo: "ZOOM" } }
    ],
    solicitud: { docentePrograma: { programaId: "p1", docente: { usuarioId: "docente-1" } } },
    ...extra
  };
}

const db = (valor: unknown) => ({ instanciaSala: { findUnique: vi.fn(async () => valor) } }) as unknown as PrismaClient;
const admin = { id: "a", rol: "ADMINISTRACION" as const, activo: true };
const titular = { id: "docente-1", rol: "DOCENTE" as const, activo: true };
const ajeno = { id: "docente-2", rol: "DOCENTE" as const, activo: true };

describe("enlace de inicio de Zoom para el anfitrión", () => {
  it("pide a Zoom un enlace nuevo del evento Zoom activo para el docente titular", async () => {
    const obtenerStartUrl = vi.fn(async () => "https://zoom.us/s/123?zak=fresco");
    const url = await obtenerEnlaceInicioZoom({ db: db(instancia()), obtenerStartUrl }, titular, "i1");
    expect(url).toBe("https://zoom.us/s/123?zak=fresco");
    expect(obtenerStartUrl).toHaveBeenCalledWith("123");
  });

  it("administración también puede", async () => {
    const obtenerStartUrl = vi.fn(async () => "https://zoom.us/s/123?zak=x");
    await expect(obtenerEnlaceInicioZoom({ db: db(instancia()), obtenerStartUrl }, admin, "i1")).resolves.toContain("zoom.us");
  });

  it("un docente ajeno recibe 403 y no se consulta a Zoom", async () => {
    const obtenerStartUrl = vi.fn(async () => "x");
    await expect(obtenerEnlaceInicioZoom({ db: db(instancia()), obtenerStartUrl }, ajeno, "i1")).rejects.toThrow(/permisos/);
    expect(obtenerStartUrl).not.toHaveBeenCalled();
  });

  it("rechaza un encuentro cancelado o terminado", async () => {
    const obtenerStartUrl = vi.fn(async () => "x");
    await expect(obtenerEnlaceInicioZoom({ db: db(instancia({ estado: "CANCELADA" })), obtenerStartUrl }, admin, "i1")).rejects.toThrow(/no está disponible/);
    await expect(obtenerEnlaceInicioZoom({ db: db(instancia({ finProgramadoAt: ayer })), obtenerStartUrl }, admin, "i1")).rejects.toThrow(/no está disponible/);
    expect(obtenerStartUrl).not.toHaveBeenCalled();
  });

  it("rechaza si el proveedor activo no es Zoom", async () => {
    const obtenerStartUrl = vi.fn(async () => "x");
    await expect(obtenerEnlaceInicioZoom({ db: db(instancia({ proveedorActivoTipo: "GOOGLE_MEET" })), obtenerStartUrl }, admin, "i1")).rejects.toThrow(/Zoom/);
  });

  it("devuelve 404 si el encuentro no existe", async () => {
    await expect(obtenerEnlaceInicioZoom({ db: db(null), obtenerStartUrl: vi.fn() }, admin, "nada")).rejects.toThrow(/no existe/);
  });

  it("falla con mensaje claro si Zoom no devuelve el enlace", async () => {
    await expect(obtenerEnlaceInicioZoom({ db: db(instancia()), obtenerStartUrl: vi.fn(async () => null) }, admin, "i1")).rejects.toThrow(/enlace de inicio/);
  });
});
