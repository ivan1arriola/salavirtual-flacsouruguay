import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { sincronizarAsistenciaPendienteZoomUseCase } from "../src/modules/archivos/application";
import { crearPrismaAsistenciaPendienteAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-asistencia-pendiente.adapter";

const AHORA = new Date("2026-11-11T12:00:00Z");
const MIN = 60_000;
const DIA = 24 * 60 * MIN;

describe("sincronizarAsistenciaPendienteZoomUseCase", () => {
  const armar = (ids: string[], sincronizar: (id: string) => Promise<unknown>) => {
    const repo = { listarOcurrenciasPorSincronizarAsistencia: vi.fn(async () => ids) };
    return {
      repo,
      run: () =>
        sincronizarAsistenciaPendienteZoomUseCase(
          { repo, sincronizar: sincronizar as never, ahora: () => AHORA },
          { limite: 20 }
        )
    };
  };

  it("sincroniza cada ocurrencia pendiente y clasifica el resultado", async () => {
    const resultados: Record<string, unknown> = {
      a: { tipo: "OK", estadoReporte: "DISPONIBLE", participantes: 3, sesionesNuevas: 3 },
      b: { tipo: "OK", estadoReporte: "VACIO" },
      c: { tipo: "PENDIENTE", estadoReporte: "NO_DISPONIBLE" },
      d: { tipo: "CONFLICTO", motivo: "REPROGRAMADO" },
      e: { tipo: "ERROR", codigo: "CAPACIDAD_PENDIENTE:403" }
    };
    const { repo, run } = armar(["a", "b", "c", "d", "e"], async (id) => resultados[id]);
    const r = await run();
    expect(repo.listarOcurrenciasPorSincronizarAsistencia).toHaveBeenCalledWith(AHORA, 20);
    expect(r).toMatchObject({
      revisadas: 5,
      disponibles: 1,
      vacias: 1,
      pendientes: 1,
      conflictos: 1,
      errores: 1
    });
    expect(r.codigosError).toEqual(["CAPACIDAD_PENDIENTE:403"]);
  });

  it("una excepción en una ocurrencia no frena a las demás y no filtra su mensaje", async () => {
    const { run } = armar(["a", "b"], async (id) => {
      if (id === "a") {
        throw new Error("https://api.zoom.us?token=SECRETO");
      }
      return { tipo: "OK", estadoReporte: "DISPONIBLE", participantes: 1, sesionesNuevas: 1 };
    });
    const r = await run();
    expect(r).toMatchObject({ revisadas: 2, disponibles: 1, errores: 1 });
    expect(JSON.stringify(r)).not.toContain("SECRETO");
  });

  it("sin pendientes no hace nada", async () => {
    const sincronizar = vi.fn();
    const { run } = armar([], sincronizar);
    expect(await run()).toMatchObject({ revisadas: 0 });
    expect(sincronizar).not.toHaveBeenCalled();
  });
});

describe("crearPrismaAsistenciaPendienteAdapter", () => {
  it("recupera hasta un año, reintenta los reportes antiguos a diario y atiende primero los menos recientes", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "o1" }, { id: "o2" }]);
    const adapter = crearPrismaAsistenciaPendienteAdapter({
      db: { ocurrenciaArchivoZoom: { findMany } } as unknown as PrismaClient
    });
    expect(await adapter.listarOcurrenciasPorSincronizarAsistencia(AHORA, 20)).toEqual(["o1", "o2"]);
    const arg = findMany.mock.calls[0]![0];
    expect(arg.take).toBe(20);
    expect(arg.orderBy).toEqual([{ updatedAt: "asc" }, { id: "asc" }]);
    expect(arg.where.OR).toEqual([
      {
        estadoAsistencia: "PENDIENTE",
        inicioRealAt: {
          gte: new Date(AHORA.getTime() - 365 * DIA),
          lte: new Date(AHORA.getTime() - 15 * MIN)
        }
      },
      {
        estadoAsistencia: { in: ["NO_DISPONIBLE", "ERROR"] },
        inicioRealAt: { gte: new Date(AHORA.getTime() - 3 * DIA) },
        updatedAt: { lte: new Date(AHORA.getTime() - 15 * MIN) }
      },
      {
        estadoAsistencia: { in: ["NO_DISPONIBLE", "ERROR"] },
        inicioRealAt: {
          gte: new Date(AHORA.getTime() - 365 * DIA),
          lt: new Date(AHORA.getTime() - 3 * DIA)
        },
        updatedAt: { lte: new Date(AHORA.getTime() - DIA) }
      }
    ]);
  });
});
