import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { filtroProveedorActivo } from "../src/modules/reuniones/proveedor-reunion.domain";
import { obtenerDatosPaginaReuniones } from "../src/modules/reuniones/reuniones-page.service";

const admin = { id: "a", rol: "ADMINISTRACION" as const, activo: true };

function fakeDb(solicitudesDeSerie: readonly { id: string }[] = []) {
  const db = {
    instanciaSala: { count: vi.fn(async (_arg: unknown) => 0), findMany: vi.fn(async (_arg: unknown) => []) },
    solicitudSala: {
      count: vi.fn(async (_arg: unknown) => solicitudesDeSerie.length),
      findMany: vi.fn(async (_arg: unknown) => solicitudesDeSerie)
    },
    programa: { findMany: vi.fn(async (_arg: unknown) => []) }
  };
  return { db, cliente: db as unknown as PrismaClient };
}

const incluye = (valor: unknown, filtro: unknown) => JSON.stringify(valor).includes(JSON.stringify(filtro));
const donde = (llamada: readonly unknown[] | undefined) => (llamada?.[0] as { where: unknown }).where;

describe("lista de reuniones filtrada por proveedor", () => {
  it("la vista por encuentros filtra los encuentros y sus conteos por el proveedor pedido", async () => {
    const { db, cliente } = fakeDb();
    const datos = await obtenerDatosPaginaReuniones(cliente, admin, {
      vista: "encuentros",
      proveedor: "zoom"
    });
    const filtro = filtroProveedorActivo("ZOOM");
    expect(datos.proveedor).toBe("ZOOM");
    expect(incluye(donde(db.instanciaSala.findMany.mock.calls[0]), filtro)).toBe(true);
    for (const llamada of db.instanciaSala.count.mock.calls) {
      expect(incluye(donde(llamada), filtro)).toBe(true);
    }
    expect(incluye(donde(db.solicitudSala.count.mock.calls[0]), filtro)).toBe(true);
  });

  it("la vista por series sólo trae los encuentros del proveedor, aunque la serie sea mixta", async () => {
    const { db, cliente } = fakeDb([{ id: "s1" }]);
    await obtenerDatosPaginaReuniones(cliente, admin, { vista: "series", proveedor: "meet" });
    const filtro = filtroProveedorActivo("GOOGLE_MEET");
    expect(incluye(donde(db.solicitudSala.findMany.mock.calls[0]), filtro)).toBe(true);
    const traeEncuentros = db.instanciaSala.findMany.mock.calls.find((llamada) =>
      JSON.stringify(donde(llamada)).includes('"solicitudSalaId"')
    );
    expect(traeEncuentros).toBeDefined();
    expect(incluye(donde(traeEncuentros), filtro)).toBe(true);
  });

  it("sin proveedor no se filtra y el resto de los usos queda igual", async () => {
    const { db, cliente } = fakeDb();
    const datos = await obtenerDatosPaginaReuniones(cliente, admin, { vista: "encuentros" });
    expect(datos.proveedor).toBeNull();
    expect(JSON.stringify(donde(db.instanciaSala.findMany.mock.calls[0]))).not.toContain(
      "proveedorActivoTipo"
    );
  });
});

describe("límite diario de la agenda en Uruguay", () => {
  it.each(["proximas", "anteriores"] as const)("usa medianoche en %s", async (periodo) => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-25T02:59:59Z"));
      const { db, cliente } = fakeDb();
      await obtenerDatosPaginaReuniones(cliente, admin, { vista: "encuentros", periodo });
      const medianoche = new Date("2026-11-24T03:00:00Z");
      const filtro = periodo === "proximas" ? { gte: medianoche } : { lt: medianoche };
      expect(donde(db.instanciaSala.findMany.mock.calls[0])).toMatchObject({ finProgramadoAt: filtro });
    } finally {
      vi.useRealTimers();
    }
  });

  it("mueve el límite al día siguiente a las 00:00 de Uruguay, también por serie", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-25T03:00:00Z"));
      const { db, cliente } = fakeDb([{ id: "s1" }]);
      await obtenerDatosPaginaReuniones(cliente, admin, { vista: "series" });
      const filtro = { gte: new Date("2026-11-25T03:00:00Z") };
      expect(donde(db.solicitudSala.findMany.mock.calls[0])).toMatchObject({
        instancias: { some: { finProgramadoAt: filtro } }
      });
      expect(donde(db.instanciaSala.findMany.mock.calls[0])).toMatchObject({ finProgramadoAt: filtro });
    } finally {
      vi.useRealTimers();
    }
  });
});
