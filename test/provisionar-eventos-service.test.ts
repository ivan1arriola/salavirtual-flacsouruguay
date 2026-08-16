import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import type { MeetProvider } from "../src/modules/meet/provider";
import { sincronizarEventosPendientes } from "../src/modules/meet/provisionar-eventos.service";

type Operation = "PROVISIONAR" | "REPROGRAMAR" | "CONFIGURAR_MEET" | "CANCELAR" | null;

function fixture(operation: Operation, options?: { externalEventId?: string | null; estadoInstancia?: "PROGRAMADA" | "CANCELADA" }) {
  const state = {
    solicitudEstado: "PROVISIONANDO",
    event: {
      id: "event-1",
      externalEventId: options?.externalEventId ?? null,
      codigoReunion: options?.externalEventId ? "abc-defg-hij" : null,
      joinUrl: options?.externalEventId ? "https://meet.google.com/abc-defg-hij" : null,
      payloadUltimo: null as unknown,
      estadoIntegracion: operation ? "PENDIENTE" : "SINCRONIZADA",
      operacionPendiente: operation,
      reclamoIntegracionAt: null as Date | null,
      errorIntegracion: null as string | null,
      sincronizadoAt: null as Date | null,
      updatedAt: new Date("2026-08-16T20:00:00Z"),
      cuentaProveedor: { emailOrganizador: "sala@flacso.edu.uy" },
      instancia: {
        id: "meeting-1",
        solicitudSalaId: "request-1",
        estado: options?.estadoInstancia ?? "PROGRAMADA",
        descripcion: null,
        inicioProgramadoAt: new Date("2026-08-20T16:00:00Z"),
        finProgramadoAt: new Date("2026-08-20T17:00:00Z"),
        timezone: "America/Montevideo",
        requiereAsistenciaTecnica: false,
        requiereGrabacion: false,
        solicitud: {
          id: "request-1",
          titulo: "Clase",
          descripcion: null,
        },
        cohosts: [] as Array<{ cuentaGoogle: { email: string } }>,
        cohostEmails: [] as Array<{ email: string }>,
      },
    },
  };

  const sameDate = (left: unknown, right: unknown) => {
    if (left == null || right == null) return left === right;
    if (left instanceof Date && right instanceof Date) return left.getTime() === right.getTime();
    return left === right;
  };
  const matches = (where: Record<string, unknown>) => {
    if (where.id && where.id !== state.event.id) return false;
    if ("operacionPendiente" in where && where.operacionPendiente !== state.event.operacionPendiente) return false;
    if ("reclamoIntegracionAt" in where && !sameDate(where.reclamoIntegracionAt, state.event.reclamoIntegracionAt)) return false;
    if ("updatedAt" in where && !sameDate(where.updatedAt, state.event.updatedAt)) return false;
    return true;
  };
  const apply = (data: Record<string, unknown>) => {
    Object.assign(state.event, data);
    state.event.updatedAt = new Date(state.event.updatedAt.getTime() + 1);
  };

  let configReads = 0;
  const db = {
    configuracionGoogleWorkspace: {
      findUnique: vi.fn(async () => {
        configReads += 1;
        return { serviceAccountEmail: "sa@project.iam.gserviceaccount.com", privateKeyCifrada: "encrypted" };
      }),
    },
    eventoProveedor: {
      findMany: vi.fn(async () => [{
        id: state.event.id,
        estadoIntegracion: state.event.estadoIntegracion,
        operacionPendiente: state.event.operacionPendiente,
        reclamoIntegracionAt: state.event.reclamoIntegracionAt,
        errorIntegracion: state.event.errorIntegracion,
      }]),
      findUnique: vi.fn(async () => state.event),
      findFirst: vi.fn(async () => null),
      update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => {
        apply(data);
        return state.event;
      }),
      updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
        if (!matches(where)) return { count: 0 };
        apply(data);
        return { count: 1 };
      }),
    },
    instanciaSala: {
      findMany: vi.fn(async () => state.event.instancia.estado === "CANCELADA" ? [] : [{
        inicioProgramadoAt: state.event.instancia.inicioProgramadoAt,
        finProgramadoAt: state.event.instancia.finProgramadoAt,
        requiereAsistenciaTecnica: state.event.instancia.requiereAsistenciaTecnica,
        requiereGrabacion: state.event.instancia.requiereGrabacion,
        eventosProveedor: [{ estadoIntegracion: state.event.estadoIntegracion }],
      }]),
    },
    solicitudSala: {
      update: vi.fn(async ({ data }: { data: { estado?: string } }) => {
        if (data.estado) state.solicitudEstado = data.estado;
        return {};
      }),
    },
    $executeRaw: vi.fn(async () => 0),
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback(db)),
  };

  return {
    state,
    db: db as unknown as PrismaClient,
    getConfigReads: () => configReads,
  };
}

function meetResult() {
  return {
    externalEventId: "calendar-1",
    codigoReunion: "abc-defg-hij",
    joinUrl: "https://meet.google.com/abc-defg-hij",
    payload: { id: "calendar-1" },
  };
}

function provider(overrides: Partial<MeetProvider> = {}): MeetProvider {
  return {
    crearEventoCalendar: vi.fn(async () => ({ externalEventId: "calendar-1", payload: { id: "calendar-1" } })),
    obtenerEvento: vi.fn(async () => meetResult()),
    configurarEventoMeet: vi.fn(async () => undefined),
    cancelarEvento: vi.fn(async () => undefined),
    actualizarEvento: vi.fn(async () => undefined),
    ...overrides,
  };
}

describe("sincronizarEventosPendientes", () => {
  it("no toca credenciales ni degrada un evento ya sincronizado durante un replay idempotente", async () => {
    const f = fixture(null, { externalEventId: "calendar-1" });
    const results = await sincronizarEventosPendientes({
      db: f.db,
      descifrar: () => { throw new Error("no debería ejecutarse"); },
      crearProvider: () => provider(),
    }, ["event-1"]);

    expect(results).toEqual([{ eventoProveedorId: "event-1", estado: "SINCRONIZADA" }]);
    expect(f.getConfigReads()).toBe(0);
    expect(f.state.event.estadoIntegracion).toBe("SINCRONIZADA");
  });

  it("no borra una CANCELAR creada mientras un PROVISIONAR estaba esperando a Google", async () => {
    const f = fixture("PROVISIONAR");
    const p = provider({
      crearEventoCalendar: vi.fn(async () => {
        f.state.event.instancia.estado = "CANCELADA";
        f.state.event.operacionPendiente = "CANCELAR";
        f.state.event.reclamoIntegracionAt = null;
        f.state.event.estadoIntegracion = "PENDIENTE";
        f.state.event.updatedAt = new Date(f.state.event.updatedAt.getTime() + 50);
        return { externalEventId: "calendar-1", payload: { id: "calendar-1" } };
      }),
    });

    const results = await sincronizarEventosPendientes({
      db: f.db,
      descifrar: () => "private-key",
      crearProvider: () => p,
    }, ["event-1"]);

    expect(results[0]?.estado).toBe("EN_PROCESO");
    expect(f.state.event.externalEventId).toBe("calendar-1");
    expect(f.state.event.operacionPendiente).toBe("CANCELAR");
  });

  it("reencola una reconciliación si un worker viejo termina después de una reprogramación más nueva", async () => {
    const f = fixture("REPROGRAMAR", { externalEventId: "calendar-1" });
    const p = provider({
      actualizarEvento: vi.fn(async () => {
        f.state.event.instancia.inicioProgramadoAt = new Date("2026-08-20T18:00:00Z");
        f.state.event.instancia.finProgramadoAt = new Date("2026-08-20T19:00:00Z");
        f.state.event.operacionPendiente = null;
        f.state.event.reclamoIntegracionAt = null;
        f.state.event.estadoIntegracion = "SINCRONIZADA";
        f.state.event.updatedAt = new Date(f.state.event.updatedAt.getTime() + 50);
      }),
    });

    const results = await sincronizarEventosPendientes({
      db: f.db,
      descifrar: () => "private-key",
      crearProvider: () => p,
    }, ["event-1"]);

    expect(results[0]?.estado).toBe("EN_PROCESO");
    expect(f.state.event.operacionPendiente).toBe("REPROGRAMAR");
    expect(f.state.event.estadoIntegracion).toBe("PENDIENTE");
  });


  it("invalida un claim más nuevo si un worker obsoleto acaba de aplicar un efecto externo", async () => {
    const f = fixture("REPROGRAMAR", { externalEventId: "calendar-1" });
    const p = provider({
      actualizarEvento: vi.fn(async () => {
        f.state.event.operacionPendiente = "REPROGRAMAR";
        f.state.event.reclamoIntegracionAt = new Date("2026-08-16T20:05:00Z");
        f.state.event.estadoIntegracion = "PENDIENTE";
        f.state.event.updatedAt = new Date(f.state.event.updatedAt.getTime() + 50);
      }),
    });

    const results = await sincronizarEventosPendientes({
      db: f.db,
      descifrar: () => "private-key",
      crearProvider: () => p,
    }, ["event-1"]);

    expect(results[0]?.estado).toBe("EN_PROCESO");
    expect(f.state.event.operacionPendiente).toBe("REPROGRAMAR");
    expect(f.state.event.reclamoIntegracionAt).toBeNull();
    expect(f.state.event.estadoIntegracion).toBe("PENDIENTE");
  });

  it("mantiene CONFIGURAR_MEET en ERROR y permite reintentarla", async () => {
    const f = fixture("CONFIGURAR_MEET", { externalEventId: "calendar-1" });
    let fail = true;
    const p = provider({
      configurarEventoMeet: vi.fn(async () => {
        if (fail) throw new Error("Meet temporalmente no disponible");
      }),
    });
    const deps = { db: f.db, descifrar: () => "private-key", crearProvider: () => p };

    const first = await sincronizarEventosPendientes(deps, ["event-1"]);
    expect(first[0]?.estado).toBe("ERROR");
    expect(f.state.event.operacionPendiente).toBe("CONFIGURAR_MEET");
    expect(f.state.event.estadoIntegracion).toBe("ERROR");

    fail = false;
    const second = await sincronizarEventosPendientes(deps, ["event-1"]);
    expect(second[0]?.estado).toBe("SINCRONIZADA");
    expect(f.state.event.operacionPendiente).toBeNull();
    expect(f.state.event.estadoIntegracion).toBe("SINCRONIZADA");
  });

  it("considera 404 de Calendar como cancelación idempotente exitosa", async () => {
    const f = fixture("CANCELAR", { externalEventId: "calendar-1", estadoInstancia: "CANCELADA" });
    const p = provider({
      cancelarEvento: vi.fn(async () => { throw { response: { status: 404 } }; }),
    });

    const results = await sincronizarEventosPendientes({
      db: f.db,
      descifrar: () => "private-key",
      crearProvider: () => p,
    }, ["event-1"]);

    expect(results[0]?.estado).toBe("SINCRONIZADA");
    expect(f.state.event.operacionPendiente).toBeNull();
  });
});
