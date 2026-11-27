/* eslint-disable @typescript-eslint/no-explicit-any */
import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearPrismaConciliacionAsistenciaZoomRepositoryAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-conciliacion-asistencia-zoom-repository.adapter";

const CAMBIO = {
  estadoConciliacion: "CONCILIADO" as const,
  invitadoReunionId: "inv",
  esExterno: false,
};

function crear(opciones: { actual?: any; invitado?: any; count?: number } = {}) {
  const actual =
    opciones.actual === undefined
      ? {
          version: 2,
          estadoConciliacion: "SIN_CONCILIAR",
          invitadoReunionId: null,
          esExterno: null,
          eventoProveedor: { instanciaSalaId: "i1" },
        }
      : opciones.actual;
  const tx = {
    registroAsistenciaZoom: {
      findUnique: vi.fn(async () => actual),
      updateMany: vi.fn(async () => ({ count: opciones.count ?? 1 })),
    },
    invitadoReunion: {
      findUnique: vi.fn(async () =>
        opciones.invitado === undefined ? { instanciaSalaId: "i1" } : opciones.invitado,
      ),
    },
    auditoria: { create: vi.fn(async () => ({})) },
  };
  const db = { $transaction: async (fn: any) => fn(tx) } as unknown as PrismaClient;
  return { tx, repo: crearPrismaConciliacionAsistenciaZoomRepositoryAdapter({ db }) };
}

describe("repositorio de conciliación de asistencia Zoom", () => {
  it("aplica el cambio con la versión en el WHERE, la incrementa y audita actor, anterior y nuevo", async () => {
    const { tx, repo } = crear();
    expect(await repo.aplicar("r1", 2, CAMBIO, "actor")).toEqual({ tipo: "APLICADO", version: 3 });
    const arg = (tx.registroAsistenciaZoom.updateMany.mock.calls[0] as any[])[0];
    expect(arg.where).toEqual({ id: "r1", version: 2 });
    expect(arg.data.version).toEqual({ increment: 1 });
    const auditoria = (tx.auditoria.create.mock.calls[0] as any[])[0].data;
    expect(auditoria).toMatchObject({
      actorUsuarioId: "actor",
      accion: "ZOOM_ASISTENCIA_CONCILIADA",
      entidadId: "r1",
    });
    expect(auditoria.valorAnterior).toMatchObject({ estadoConciliacion: "SIN_CONCILIAR" });
    expect(auditoria.valorNuevo).toMatchObject({
      estadoConciliacion: "CONCILIADO",
      invitadoReunionId: "inv",
    });
    expect(JSON.stringify(auditoria)).not.toMatch(/https?:|token/i);
  });

  it("edición simultánea (ninguna fila coincide con la versión): CONFLICTO y sin auditoría", async () => {
    const { tx, repo } = crear({ count: 0 });
    expect(await repo.aplicar("r1", 2, CAMBIO, "actor")).toEqual({ tipo: "CONFLICTO" });
    expect(tx.auditoria.create).not.toHaveBeenCalled();
  });

  it("invitado de otro encuentro o inexistente: INVITADO_AJENO sin escribir", async () => {
    for (const invitado of [{ instanciaSalaId: "otra" }, null]) {
      const { tx, repo } = crear({ invitado });
      expect(await repo.aplicar("r1", 2, CAMBIO, "actor")).toEqual({ tipo: "INVITADO_AJENO" });
      expect(tx.registroAsistenciaZoom.updateMany).not.toHaveBeenCalled();
    }
  });

  it("registro sin encuentro (ámbito ocurrencia) no admite vincular invitados", async () => {
    const { repo } = crear({
      actual: {
        version: 2,
        estadoConciliacion: "SIN_CONCILIAR",
        invitadoReunionId: null,
        esExterno: null,
        eventoProveedor: null,
      },
    });
    expect(await repo.aplicar("r1", 2, CAMBIO, "actor")).toEqual({ tipo: "INVITADO_AJENO" });
  });

  it("registro inexistente: NO_ENCONTRADO", async () => {
    expect(await crear({ actual: null }).repo.aplicar("x", 1, CAMBIO, "actor")).toEqual({
      tipo: "NO_ENCONTRADO",
    });
  });
});

describe("la vía antigua de edición no alcanza la asistencia de Zoom", () => {
  const servicio = readFileSync("src/modules/reuniones/reunion-operativa.service.ts", "utf8");
  const ruta = readFileSync(
    "app/api/v1/reuniones/instancias/[instanciaId]/control-operativo/route.ts",
    "utf8",
  );

  it("guardarRegistroAsistenciaOperativo y control-operativo solo escriben RegistroAsistenciaMeet", () => {
    expect(servicio).not.toMatch(
      /registroAsistenciaZoom|RegistroAsistenciaZoom|sesionAsistenciaZoom/,
    );
    expect(ruta).not.toMatch(/AsistenciaZoom/);
    expect(servicio).toMatch(/db\.registroAsistenciaMeet\.upsert/);
  });

  it("la ruta de conciliación es el único camino de edición y exige permisos, versión y auditoría", () => {
    const rutaNueva = readFileSync(
      "app/api/v1/reuniones/instancias/[instanciaId]/asistencia/conciliar/route.ts",
      "utf8",
    );
    const caso = readFileSync(
      "src/modules/archivos/application/conciliar-asistencia-zoom.use-case.ts",
      "utf8",
    );
    expect(rutaNueva).toMatch(/conciliarAsistenciaZoom/);
    expect(caso).toMatch(/puedeConciliarAsistenciaZoom/);
    expect(caso).toMatch(/entrada\.version/);
  });
});
