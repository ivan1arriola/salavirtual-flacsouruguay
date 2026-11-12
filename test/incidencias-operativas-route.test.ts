import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  session: { user: { id: "at-1", email: "at@flacso.edu.uy" } } as any,
  actor: { id: "at-1", rol: "ASISTENTE_TECNICO", activo: true } as any,
  calls: [] as unknown[]
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status?: number }) => ({
      body,
      status: init?.status ?? 200
    })
  }
}));
vi.mock("@/auth", () => ({ auth: async () => state.session }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => state.actor
}));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/bootstrap/reunion-operativa.server", () => ({
  registrarIncidenciaOperativa: async (...args: unknown[]) => {
    state.calls.push(args);
    return {
      id: "inc-1",
      tipo: "AUDIO_VIDEO",
      severidad: "MEDIA",
      descripcion: "Audio entrecortado",
      estado: "ABIERTA",
      createdAt: new Date("2026-09-23T18:10:00-03:00")
    };
  }
}));

import { POST } from "../app/api/v1/reuniones/instancias/[instanciaId]/incidencias/route";

function request(body: unknown) {
  return new Request("http://localhost/api/v1/reuniones/instancias/meeting-1/incidencias", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}

describe("POST incidencia operativa", () => {
  beforeEach(() => {
    state.session = { user: { id: "at-1", email: "at@flacso.edu.uy" } };
    state.actor = { id: "at-1", rol: "ASISTENTE_TECNICO", activo: true };
    state.calls = [];
  });

  it("registra usando el actor resuelto y la instancia de la ruta", async () => {
    const response = (await POST(
      request({
        tipo: "AUDIO_VIDEO",
        severidad: "MEDIA",
        descripcion: "Audio entrecortado"
      }),
      { params: Promise.resolve({ instanciaId: "meeting-1" }) }
    )) as any;

    expect(response.status).toBe(201);
    expect(response.body.incidencia.id).toBe("inc-1");
    expect(state.calls).toEqual([
      [
        { id: "at-1", rol: "ASISTENTE_TECNICO" },
        "meeting-1",
        {
          tipo: "AUDIO_VIDEO",
          severidad: "MEDIA",
          descripcion: "Audio entrecortado"
        }
      ]
    ]);
  });

  it("rechaza una sesión ausente antes de llamar al servicio", async () => {
    state.session = null;

    const response = (await POST(request({ tipo: "OTRA", severidad: "BAJA", descripcion: "Detalle" }), {
      params: Promise.resolve({ instanciaId: "meeting-1" })
    })) as any;

    expect(response.status).toBe(401);
    expect(state.calls).toEqual([]);
  });

  it("rechaza un actor inactivo antes de llamar al servicio", async () => {
    state.actor.activo = false;

    const response = (await POST(request({ tipo: "OTRA", severidad: "BAJA", descripcion: "Detalle" }), {
      params: Promise.resolve({ instanciaId: "meeting-1" })
    })) as any;

    expect(response.status).toBe(401);
    expect(state.calls).toEqual([]);
  });
});
