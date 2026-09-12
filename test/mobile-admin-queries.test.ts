import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { getAdminMeeting, listAdminMeetings, validateAdminQuery } from "../src/modules/mobile-admin/queries";

function meeting(id: string, startsAt: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    descripcion: null,
    inicioProgramadoAt: new Date(startsAt),
    finProgramadoAt: new Date(new Date(startsAt).getTime() + 60 * 60 * 1000),
    timezone: "America/Montevideo",
    estado: "PROGRAMADA",
    requiereAsistenciaTecnica: true,
    solicitud: {
      id: `request-${id}`,
      titulo: `Clase ${id}`,
      descripcion: null,
      modalidad: "VIRTUAL",
      docentePrograma: {
        programa: { id: "program-1", nombre: "Maestría" },
        docente: { usuario: { nombres: "Ana", apellidos: "Pérez" } }
      }
    },
    eventosProveedor: [{
      joinUrl: `https://meet.google.com/${id}`,
      proveedor: { tipo: "GOOGLE_MEET" },
      cuentaProveedor: { emailOrganizador: "salas@flacso.edu.uy", nombre: "Sala" }
    }],
    asignaciones: [],
    ...overrides
  };
}

const validQuery = {
  from: "2026-09-01T00:00:00Z",
  to: "2026-10-01T00:00:00Z",
  limit: 2
} as const;

describe("consultas de administración móvil", () => {
  it("rechaza intervalos, límites, estados y coberturas inválidos", () => {
    expect(() => validateAdminQuery({ ...validQuery, from: validQuery.to })).toThrow("from debe ser anterior");
    expect(() => validateAdminQuery({ ...validQuery, limit: 0 })).toThrow("limit");
    expect(() => validateAdminQuery({ ...validQuery, state: "OTRO" })).toThrow("state");
    expect(() => validateAdminQuery({ ...validQuery, coverage: "partial" as never })).toThrow("coverage");
  });

  it("ordena por inicio e id y emite un cursor para la segunda página", async () => {
    const a = meeting("a", "2026-09-02T09:00:00Z");
    const b = meeting("b", "2026-09-02T09:00:00Z");
    const c = meeting("c", "2026-09-03T09:00:00Z");
    const findMany = vi.fn()
      .mockResolvedValueOnce([a, b, c])
      .mockResolvedValueOnce([c]);
    const db = { instanciaSala: { findMany } } as unknown as PrismaClient;

    const first = await listAdminMeetings(db, validQuery);
    const second = await listAdminMeetings(db, { ...validQuery, cursor: first.nextCursor ?? undefined });

    expect(first.items.map(({ id }) => id)).toEqual(["a", "b"]);
    expect(second.items.map(({ id }) => id)).toEqual(["c"]);
    expect(new Set([...first.items, ...second.items].map(({ id }) => id)).size).toBe(3);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
      take: 3
    });
  });

  it("aplica búsqueda, programa, estado y cobertura antes de paginar", async () => {
    const findMany = vi.fn().mockResolvedValue([meeting("match", "2026-09-04T09:00:00Z")]);
    const db = { instanciaSala: { findMany } } as unknown as PrismaClient;

    const page = await listAdminMeetings(db, {
      ...validQuery,
      q: "ana",
      programId: "program-1",
      state: "PROGRAMADA",
      coverage: "unassigned",
      limit: 1
    });

    expect(page.items.map(({ id }) => id)).toEqual(["match"]);
    expect(findMany.mock.calls[0][0]).toMatchObject({
      take: 2,
      where: {
        estado: "PROGRAMADA",
        asignaciones: { none: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } }
      }
    });
    expect(findMany.mock.calls[0][0].where.AND).toEqual(expect.arrayContaining([
      expect.objectContaining({ solicitud: expect.objectContaining({ OR: expect.any(Array) }) }),
      { solicitud: { docentePrograma: { programaId: "program-1" } } }
    ]));
  });

  it("mapea campos opcionales ausentes como null", async () => {
    const row = meeting("nulls", "2026-09-05T09:00:00Z", {
      descripcion: null,
      eventosProveedor: [],
      asignaciones: []
    });
    const db = {
      instanciaSala: { findUnique: vi.fn().mockResolvedValue(row) }
    } as unknown as PrismaClient;

    const result = await getAdminMeeting(db, "nulls");

    expect(result).toMatchObject({
      id: "nulls",
      googleAccount: null,
      meetUrl: null,
      description: null,
      assignment: null
    });
  });
});
