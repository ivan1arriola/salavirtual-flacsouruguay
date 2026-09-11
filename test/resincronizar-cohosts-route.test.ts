import { beforeEach, describe, it, vi } from "vitest";
import assert from "node:assert/strict";

const state = vi.hoisted(() => ({
  actor: { id: "admin", rol: "ADMINISTRACION", activo: true },
  calls: [] as Array<{ kind: string; input: any }>,
  queued: true,
  outcome: "SINCRONIZADA",
  meetings: [] as any[],
}));
vi.mock("next/server", () => ({ NextResponse: { json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }) } }));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "admin", email: "admin@flacso.edu.uy", role: "ADMINISTRACION" } }) }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({ resolveSessionActor: async () => state.actor }));
vi.mock("@/src/lib/config/encryption", () => ({ descifrarConfiguracion: () => "test-only" }));
vi.mock("@/src/modules/meet/google-calendar.adapter", () => ({ crearGoogleCalendarProvider: () => ({}) }));
vi.mock("@/src/modules/meet/provisionar-eventos.service", () => ({ provisionarEventosMeet: async (_deps: unknown, ids: string[]) => {
  state.calls.push({ kind: "sync", input: ids });
  return [{ estado: state.outcome, error: state.outcome === "ERROR" ? "Google rejected cohost" : undefined }];
} }));
vi.mock("@/src/lib/db", () => {
  const tx = {
    eventoProveedor: { updateMany: async (input: unknown) => { state.calls.push({ kind: "queue", input }); return { count: state.queued ? 1 : 0 }; } },
    cohostReunion: { createMany: async (input: any) => { state.calls.push({ kind: "linked", input }); return { count: input.data.length }; } },
    cohostEmailReunion: { createMany: async (input: any) => { state.calls.push({ kind: "manual", input }); return { count: input.data.length }; } },
  };
  return { db: {
    instanciaSala: { findMany: async () => state.meetings },
    $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx),
    auditoria: { create: async () => ({}) },
  } };
});

import { POST } from "../app/api/v1/configuracion/google-workspace/resincronizar-cohosts/route";

beforeEach(() => {
  state.actor = { id: "admin", rol: "ADMINISTRACION", activo: true };
  state.calls = []; state.queued = true; state.outcome = "SINCRONIZADA";
  state.meetings = [{ id: "meeting", inicioProgramadoAt: new Date("2027-01-01"),
    solicitud: { titulo: "Clase", docentePrograma: { docente: { usuario: {
      emailPrincipal: "docente@gmail.com", cuentasGoogle: [],
    } } } },
    asignaciones: [{ asistenteTecnico: { usuario: { emailPrincipal: "tecnico@otra.edu.uy",
      cuentasGoogle: [{ id: "assistant-google", email: "tecnico@otra.edu.uy" }] } } }],
    eventosProveedor: [{ id: "event", externalEventId: "calendar-event", codigoReunion: "abc-defg-hij",
      cuentaProveedor: { emailOrganizador: "sala01@flacso.edu.uy" } }],
  }];
});

describe("reparación de reuniones existentes", () => {
  it("completa al docente Gmail y al técnico externo y verifica el evento existente", async () => {
    const response = await POST() as any;
    assert.equal(response.body.sincronizadas, 1);
    assert.equal(response.body.cohostsExternosPendientes, 0);
    assert.deepEqual(state.calls.find(({ kind }) => kind === "manual")?.input.data, [{ instanciaSalaId: "meeting", email: "docente@gmail.com" }]);
    assert.deepEqual(state.calls.find(({ kind }) => kind === "linked")?.input.data, [{ instanciaSalaId: "meeting", cuentaGoogleId: "assistant-google" }]);
    assert.deepEqual(state.calls.find(({ kind }) => kind === "sync")?.input, ["event"]);
  });
  it("no declara sincronizada una reunión cuyos roles Google rechazó", async () => {
    state.outcome = "ERROR";
    const response = await POST() as any;
    assert.equal(response.body.sincronizadas, 0);
    assert.equal(response.body.fallidas, 1);
    assert.match(response.body.errores[0].error, /Google rejected/);
  });
  it("no pisa una cancelación, reprogramación o sincronización en curso", async () => {
    state.queued = false;
    const response = await POST() as any;
    assert.equal(response.body.omitidas, 1);
    assert.equal(state.calls.some(({ kind }) => kind === "sync" || kind === "manual" || kind === "linked"), false);
    assert.deepEqual(state.calls[0].input.where.OR, [{ operacionPendiente: null }, { operacionPendiente: "CONFIGURAR_MEET" }]);
    assert.equal(state.calls[0].input.where.reclamoIntegracionAt, null);
  });
  it("exige administración activa antes de consultar las reuniones", async () => {
    state.actor.activo = false;
    const response = await POST() as any;
    assert.equal(response.status, 403);
    assert.equal(state.calls.length, 0);
  });
});
