/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearPrismaAsistenciaZoomRepositoryAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-asistencia-zoom-repository.adapter";
import type { AsistenciaZoomConsolidada, SesionObservadaZoom } from "../src/modules/archivos/domain";

const t = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
const VERSION = { uuid: "u1", eventoProveedorId: "e1", inicioProgramadoAt: t("10:00"), finProgramadoAt: t("11:00") };

const sesion = (clave: string): SesionObservadaZoom => ({
  claveSesion: clave, participanteId: "p1", userId: "u", nombre: "Ana", email: "ana@x.com",
  entradaAt: t("10:00"), salidaAt: t("10:30"), status: "in_meeting", rol: null
});
const resumen = (clave: string): AsistenciaZoomConsolidada => ({
  claveParticipante: clave, nombre: "Ana", emailObservado: "ana@x.com", minutos: 30, porcentaje: 50, sesiones: 1,
  primeraEntradaAt: t("10:00"), ultimaSalidaAt: t("10:30"), esHostOCohost: false, claveSesiones: ["s1"], estadoConciliacion: "SIN_CONCILIAR"
});

function crear(opciones: { ocurrencia?: any; existentes?: string[] } = {}) {
  const ocurrencia = opciones.ocurrencia === undefined
    ? { id: "o1", uuid: "u1", eventoProveedorId: "e1", eventoProveedor: { instancia: { inicioProgramadoAt: t("10:00"), finProgramadoAt: t("11:00") } } }
    : opciones.ocurrencia;
  const existentes = new Set(opciones.existentes ?? []);
  const tx = {
    ocurrenciaArchivoZoom: { findUnique: vi.fn(async () => ocurrencia) },
    sesionAsistenciaZoom: {
      createMany: vi.fn(async ({ data }: any) => ({ count: data.filter((d: any) => !existentes.has(d.claveSesion)).length })),
      deleteMany: vi.fn(), delete: vi.fn()
    },
    registroAsistenciaZoom: {
      findMany: vi.fn(async () => [...existentes].map((c) => ({ claveParticipante: c }))),
      createMany: vi.fn(async ({ data }: any) => ({ count: data.length })),
      update: vi.fn(async () => ({})),
      updateMany: vi.fn(async (..._a: any[]) => ({ count: 1 })),
      deleteMany: vi.fn(), delete: vi.fn()
    }
  };
  const db = { $transaction: async (fn: any) => fn(tx) } as unknown as PrismaClient;
  return { tx, repo: crearPrismaAsistenciaZoomRepositoryAdapter({ db }) };
}

describe("repositorio de asistencia Zoom (unidad)", () => {
  it("guarda sesiones de forma idempotente (createMany skipDuplicates) y el resumen por ámbito de evento", async () => {
    const { tx, repo } = crear();
    const r = await repo.guardarSesionesYResumen("o1", VERSION, [sesion("s1"), sesion("s2")], [resumen("id:p1")]);
    expect(r).toMatchObject({ tipo: "GUARDADO", sesionesNuevas: 2, registrosCreados: 1, registrosActualizados: 0 });
    expect(tx.sesionAsistenciaZoom.createMany.mock.calls[0]![0]).toMatchObject({ skipDuplicates: true });
    const filas = (tx.registroAsistenciaZoom.createMany.mock.calls[0]![0] as any).data;
    expect(filas[0]).toMatchObject({ claveAmbito: "evento:e1", eventoProveedorId: "e1", ocurrenciaId: "o1", claveParticipante: "id:p1" });
  });

  it("sin encuentro el ámbito es la ocurrencia", async () => {
    const { tx, repo } = crear({ ocurrencia: { id: "o1", uuid: "u1", eventoProveedorId: null, eventoProveedor: null } });
    await repo.guardarSesionesYResumen("o1", { ...VERSION, eventoProveedorId: null, inicioProgramadoAt: null, finProgramadoAt: null }, [], [resumen("id:p1")]);
    const fila = (tx.registroAsistenciaZoom.createMany.mock.calls[0]![0] as any).data[0];
    expect(fila).toMatchObject({ claveAmbito: "ocurrencia:o1", eventoProveedorId: null, ocurrenciaId: "o1" });
  });

  it("al actualizar un registro existente solo toca campos calculados: conciliación, invitado, externo, notas y versión sobreviven", async () => {
    const { tx, repo } = crear({ existentes: ["id:p1"] });
    const r = await repo.guardarSesionesYResumen("o1", VERSION, [], [resumen("id:p1")]);
    expect(r).toMatchObject({ registrosCreados: 0, registrosActualizados: 1 });
    const data = (tx.registroAsistenciaZoom.updateMany.mock.calls[0]![0] as any).data;
    for (const campo of ["estadoConciliacion", "invitadoReunionId", "esExterno", "notasOperador", "version", "claveAmbito", "claveParticipante"]) {
      expect(data).not.toHaveProperty(campo);
    }
    expect(data).toMatchObject({ minutos: 30, porcentaje: 50, sesiones: 1 });
  });

  it("detecta reprogramación concurrente (UUID, evento u horario distintos) y no escribe nada", async () => {
    for (const ocurrencia of [
      { id: "o1", uuid: "OTRO", eventoProveedorId: "e1", eventoProveedor: { instancia: { inicioProgramadoAt: t("10:00"), finProgramadoAt: t("11:00") } } },
      { id: "o1", uuid: "u1", eventoProveedorId: "e2", eventoProveedor: { instancia: { inicioProgramadoAt: t("10:00"), finProgramadoAt: t("11:00") } } },
      { id: "o1", uuid: "u1", eventoProveedorId: "e1", eventoProveedor: { instancia: { inicioProgramadoAt: t("10:30"), finProgramadoAt: t("11:00") } } },
      { id: "o1", uuid: "u1", eventoProveedorId: "e1", eventoProveedor: { instancia: { inicioProgramadoAt: t("10:00"), finProgramadoAt: t("11:30") } } }
    ]) {
      const { tx, repo } = crear({ ocurrencia });
      const r = await repo.guardarSesionesYResumen("o1", VERSION, [sesion("s1")], [resumen("id:p1")]);
      expect(r).toEqual({ tipo: "REPROGRAMADO" });
      expect(tx.sesionAsistenciaZoom.createMany).not.toHaveBeenCalled();
      expect(tx.registroAsistenciaZoom.createMany).not.toHaveBeenCalled();
    }
  });

  it("ocurrencia inexistente no escribe", async () => {
    const { tx, repo } = crear({ ocurrencia: null });
    expect(await repo.guardarSesionesYResumen("x", VERSION, [], [])).toEqual({ tipo: "OCURRENCIA_NO_ENCONTRADA" });
    expect(tx.sesionAsistenciaZoom.createMany).not.toHaveBeenCalled();
  });

  it("nunca borra sesiones ni registros, aunque el lote llegue vacío o parcial", async () => {
    const { tx, repo } = crear({ existentes: ["id:p1", "id:p2"] });
    await repo.guardarSesionesYResumen("o1", VERSION, [], []);
    expect(tx.sesionAsistenciaZoom.deleteMany).not.toHaveBeenCalled();
    expect(tx.registroAsistenciaZoom.deleteMany).not.toHaveBeenCalled();
    expect(tx.registroAsistenciaZoom.delete).not.toHaveBeenCalled();
  });

  it("no guarda respuesta cruda: las filas solo llevan campos acotados", async () => {
    const { tx, repo } = crear();
    await repo.guardarSesionesYResumen("o1", VERSION, [{ ...sesion("s1"), ...( { download_url: "https://x", token: "t" } as object) } as any], []);
    const fila = (tx.sesionAsistenciaZoom.createMany.mock.calls[0]![0] as any).data[0];
    expect(Object.keys(fila).sort()).toEqual(["claveSesion", "email", "entradaAt", "nombre", "ocurrenciaId", "participanteId", "rol", "salidaAt", "status", "userId"].sort());
  });
});
