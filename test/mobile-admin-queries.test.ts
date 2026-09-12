import type { PrismaClient } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/modules/dashboard/admin-dashboard.adapter", () => ({
  obtenerDashboardAdministracion: vi.fn()
}));

import { obtenerDashboardAdministracion } from "../src/modules/dashboard/admin-dashboard.adapter";
import { getAdminMeeting, getAdminSummary, listAdminMeetings, validateAdminQuery } from "../src/modules/mobile-admin/queries";

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

function dashboardMetrics(overrides: Partial<Record<string, number>> = {}) {
  return {
    metrics: {
      openRequests: 0,
      todayMeetings: 0,
      weekMeetings: 0,
      pendingAssistance: 0,
      integrationErrors: 0,
      pendingRecordings: 0,
      openIncidents: 0,
      duplicateRisks: 0,
      ...overrides
    }
  } as never;
}

const mockedDashboard = vi.mocked(obtenerDashboardAdministracion);

beforeEach(() => mockedDashboard.mockReset());

describe("consultas de administración móvil", () => {
  it("rechaza intervalos, límites, estados y coberturas inválidos", () => {
    expect(() => validateAdminQuery({ ...validQuery, from: validQuery.to })).toThrow("from debe ser anterior");
    expect(() => validateAdminQuery({ ...validQuery, limit: 0 })).toThrow("limit");
    expect(() => validateAdminQuery({ ...validQuery, state: "OTRO" })).toThrow("state");
    expect(() => validateAdminQuery({ ...validQuery, coverage: "partial" as never })).toThrow("coverage");
  });

  it("rechaza fechas ISO inexistentes en el intervalo", () => {
    expect(() => validateAdminQuery({ ...validQuery, from: "2026-02-30T00:00:00Z" })).toThrow("from debe ser ISO");
    expect(() => validateAdminQuery({ ...validQuery, to: "2026-04-31T00:00:00-03:00" })).toThrow("to debe ser ISO");
  });

  it("rechaza cursores manipulados con una fecha ISO inexistente", () => {
    const cursor = Buffer.from(JSON.stringify({ startsAt: "2026-02-30T00:00:00Z", id: "meeting-1" })).toString("base64url");

    expect(() => validateAdminQuery({ ...validQuery, cursor })).toThrow("cursor inválido");
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
    expect(findMany.mock.calls[1][0].where.AND).toContainEqual({
      OR: [
        { inicioProgramadoAt: { gt: new Date("2026-09-02T09:00:00Z") } },
        { inicioProgramadoAt: new Date("2026-09-02T09:00:00Z"), id: { gt: "b" } }
      ]
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

  it("maps a deterministic active assignment for assigned coverage", async () => {
    const findMany = vi.fn().mockResolvedValue([meeting("assigned", "2026-09-04T09:00:00Z", {
      asignaciones: [{
        id: "assignment-a",
        asistenteTecnicoId: "assistant-a",
        estado: "ACEPTADO",
        asistenteTecnico: { usuario: { nombres: "Beatriz", apellidos: "Suárez" } }
      }]
    })]);
    const db = { instanciaSala: { findMany } } as unknown as PrismaClient;

    const page = await listAdminMeetings(db, { ...validQuery, coverage: "assigned", limit: 1 });

    expect(page.items[0].assignment).toEqual({
      id: "assignment-a",
      assistantId: "assistant-a",
      name: "Beatriz Suárez",
      state: "ACEPTADO"
    });
    expect(findMany.mock.calls[0][0]).toMatchObject({
      where: { asignaciones: { some: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } } },
      include: { asignaciones: { orderBy: [{ updatedAt: "desc" }, { id: "asc" }], take: 1 } }
    });
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

  it("returns five upcoming meetings and only positive administrative attention", async () => {
    const findMany = vi.fn().mockResolvedValue([
      meeting("1", "2026-09-01T09:00:00Z"),
      meeting("2", "2026-09-02T09:00:00Z"),
      meeting("3", "2026-09-03T09:00:00Z"),
      meeting("4", "2026-09-04T09:00:00Z"),
      meeting("5", "2026-09-05T09:00:00Z")
    ]);
    const db = { instanciaSala: { findMany } } as unknown as PrismaClient;
    mockedDashboard.mockResolvedValue(dashboardMetrics({ pendingAssistance: 2, openIncidents: 1 }));

    const summary = await getAdminSummary(db);

    expect(summary.upcoming.map(({ id }) => id)).toEqual(["1", "2", "3", "4", "5"]);
    expect(summary.attention).toEqual([
      { code: "PENDING_COVERAGE", label: "Cobertura pendiente", count: 2 },
      { code: "OPEN_INCIDENTS", label: "Incidencias abiertas", count: 1 }
    ]);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
      take: 5
    }));
  });

  it("propagates administration dashboard errors", async () => {
    const db = { instanciaSala: { findMany: vi.fn().mockResolvedValue([]) } } as unknown as PrismaClient;
    mockedDashboard.mockRejectedValue(new Error("dashboard unavailable"));

    await expect(getAdminSummary(db)).rejects.toThrow("dashboard unavailable");
  });
});
