import { describe, it, expect, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { reintentarArchivoZoomUseCase } from "../src/modules/archivos/application/reintentar-archivo-zoom.use-case";
import { listarEncuentrosCandidatosZoomUseCase } from "../src/modules/archivos/application/listar-encuentros-candidatos-zoom.use-case";
import type { PrismaClient } from "@prisma/client";
import { crearPrismaZoomArchivoRepositoryAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-zoom-archivo-repository.adapter";
import { ZoomHistoricoControl } from "../src/components/zoom-historico-control";
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const admin = { id: "u", rol: "ADMINISTRACION" as const };
describe("controles Zoom", () => {
  it("rechaza roles sin consultar el repositorio", async () => {
    const repo = { reintentarArchivo: vi.fn(), listarEncuentrosCandidatosZoom: vi.fn() };
    const actor = { id: "u", rol: "DOCENTE" as const };
    expect(await reintentarArchivoZoomUseCase(repo, actor, "a")).toEqual({ tipo: "PROHIBIDO" });
    expect(await listarEncuentrosCandidatosZoomUseCase(repo, actor, "o")).toEqual({
      tipo: "PROHIBIDO",
    });
    expect(repo.reintentarArchivo).not.toHaveBeenCalled();
    expect(repo.listarEncuentrosCandidatosZoom).not.toHaveBeenCalled();
  });
  it.each(["OK", "NO_ENCONTRADO", "ESTADO_NO_REINTENTABLE"] as const)(
    "propaga %s",
    async (tipo) => {
      const repo = { reintentarArchivo: vi.fn().mockResolvedValue({ tipo }) };
      expect(await reintentarArchivoZoomUseCase(repo, admin, "a")).toEqual({ tipo });
      expect(repo.reintentarArchivo).toHaveBeenCalledWith("a", { id: "u" });
    },
  );
  it("normaliza el identificador del actor y devuelve candidatos", async () => {
    const repo = { listarEncuentrosCandidatosZoom: vi.fn().mockResolvedValue([]) };
    expect(await listarEncuentrosCandidatosZoomUseCase(repo, admin, "o")).toEqual({
      tipo: "OK",
      candidatos: [],
    });
  });
  it("renderiza controles accesibles", () => {
    const html = renderToStaticMarkup(createElement(ZoomHistoricoControl, { ocurrenciaId: "o" }));
    expect(html).toContain("Vincular a un encuentro");
    expect(html).toContain("aria-live");
  });
});

describe("persistencia del reintento", () => {
  it("reinicia solo estados recuperables y audita sin cambiar la versión del lease", async () => {
    const tx = {
      archivoOrigenZoom: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        findUnique: vi.fn(),
      },
      auditoria: { create: vi.fn() },
    };
    const db = {
      $transaction: async (f: (t: typeof tx) => unknown) => f(tx),
    } as unknown as PrismaClient;
    const repo = crearPrismaZoomArchivoRepositoryAdapter({ db, hash: (x) => x });
    expect(await repo.reintentarArchivo("a", { id: "u" })).toEqual({ tipo: "OK" });
    expect(tx.archivoOrigenZoom.updateMany).toHaveBeenCalledWith({
      where: { id: "a", estado: { in: ["ERROR_REINTENTABLE", "REQUIERE_REVISION"] } },
      data: {
        estado: "PENDIENTE",
        intentos: 0,
        proximoIntentoAt: null,
        errorCodigo: null,
        errorDetalle: null,
        leaseHasta: null,
      },
    });
    expect(tx.auditoria.create).toHaveBeenCalledOnce();
  });
  it.each([
    [null, "NO_ENCONTRADO"],
    [{ id: "a" }, "ESTADO_NO_REINTENTABLE"],
  ] as const)("rechaza cuando no se actualiza la fila", async (fila, tipo) => {
    const tx = {
      archivoOrigenZoom: {
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        findUnique: vi.fn().mockResolvedValue(fila),
      },
      auditoria: { create: vi.fn() },
    };
    const db = {
      $transaction: async (f: (t: typeof tx) => unknown) => f(tx),
    } as unknown as PrismaClient;
    const repo = crearPrismaZoomArchivoRepositoryAdapter({ db, hash: (x) => x });
    expect(await repo.reintentarArchivo("a", { id: "u" })).toEqual({ tipo });
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });
});
