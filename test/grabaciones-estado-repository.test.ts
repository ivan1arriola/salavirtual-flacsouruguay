import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearPrismaArchivosRepositoryAdapter } from "@/src/modules/archivos/infrastructure";

describe("deteccion de grabaciones en Prisma", () => {
  it("selecciona encuentros en curso para detectar grabaciones", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "evt-vivo" }]);
    const db = { eventoProveedor: { findMany } } as unknown as PrismaClient;
    const repo = crearPrismaArchivosRepositoryAdapter(db);
    const hasta = new Date("2026-10-27T18:00:00Z");

    expect(
      await repo.listarEventosOperativos({
        ventana: "CALIENTE",
        desde: new Date("2026-10-27T14:00:00Z"),
        hasta,
        limite: 10,
      }),
    ).toEqual(["evt-vivo"]);
    expect(findMany.mock.calls[0]![0].where.instancia).toEqual(
      expect.objectContaining({ inicioProgramadoAt: { lte: hasta } }),
    );
    expect(JSON.stringify(findMany.mock.calls[0]![0].where.OR)).toContain(
      '"none":{"tipo":"GRABACION"}',
    );
  });

  it("revisa una vez encuentros ya sincronizados del ultimo mes sin video", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const db = { eventoProveedor: { findMany } } as unknown as PrismaClient;
    const repo = crearPrismaArchivosRepositoryAdapter(db);
    await repo.listarEventosOperativos({
      ventana: "CIERRE",
      desde: new Date("2026-09-27T18:00:00Z"),
      hasta: new Date("2026-10-25T18:00:00Z"),
      limite: 10,
    });
    expect(JSON.stringify(findMany.mock.calls[0]![0].where.OR)).toContain(
      '"grabacionObservadaAt":null',
    );
  });

  it("incluye la grabacion activa sin archivos aunque sea opcional", async () => {
    const fecha = new Date();
    const meeting = {
      id: "inst-viva",
      inicioProgramadoAt: fecha,
      finProgramadoAt: fecha,
      requiereGrabacion: false,
      solicitud: {
        titulo: "Clase",
        docentePrograma: {
          programa: { nombre: "Curso" },
          docente: { usuario: { nombres: "Ana", apellidos: "Pérez" } },
        },
      },
      eventosProveedor: [
        {
          driveFolderId: null,
          archivosSincronizadosAt: null,
          grabacionEstadoMeet: "EN_CURSO",
          grabacionObservadaAt: fecha,
          archivos: [],
        },
      ],
    };
    const count = vi.fn().mockResolvedValue(1);
    const findMany = vi.fn().mockResolvedValue([meeting]);
    const db = { instanciaSala: { count, findMany } } as unknown as PrismaClient;
    const repo = crearPrismaArchivosRepositoryAdapter(db);

    const page = await repo.listarGrabacionesDb!(
      { id: "admin", rol: "ADMINISTRACION" },
      { pagina: 1, busqueda: "", filtro: "GRABACIONES" },
    );
    expect(page.encuentros).toMatchObject([
      { instanciaId: "inst-viva", estadoGrabacionMeet: "EN_CURSO", archivos: [] },
    ]);
    const where = JSON.stringify(findMany.mock.calls[0]![0].where);
    expect(where).toContain("grabacionEstadoMeet");
    expect(where).toContain("GRABACION");
  });
});
