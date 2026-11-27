import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  calls: [] as Array<{ kind: string; input: unknown }>,
  eventoIds: ["zoom-1", "meet-historico-1"] as string[],
  sincronizacion: [{ estado: "SINCRONIZADA" }] as Array<{ estado: string }>,
  fallaSincronizacion: false,
}));

vi.mock("next/server", () => ({
  NextResponse: {
    json: (body: unknown, init?: { status: number }) => ({ body, status: init?.status ?? 200 }),
  },
}));
vi.mock("@/auth", () => ({
  auth: async () => ({ user: { id: "admin", email: "admin@flacso.edu.uy" } }),
}));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => ({ id: "admin", rol: "ADMINISTRACION", activo: true }),
}));
vi.mock("@/src/lib/db", () => ({ db: {} }));
vi.mock("@/src/modules/reuniones/permisos-programa.service", () => ({
  puedeGestionarPrograma: async () => true,
}));
vi.mock("@/src/modules/reuniones/cancelar-solicitudes-atomicas.service", () => ({
  cancelarSolicitudesAtomicas: async (_db: unknown, _actor: unknown, ids: string[]) => {
    state.calls.push({ kind: "cancelar", input: ids });
    return { solicitudesCanceladas: ids.length, eventoProveedorIds: state.eventoIds };
  },
}));
vi.mock("@/src/bootstrap/conferencias.server", () => ({
  obtenerServicioConferencias: () => ({
    sincronizarEventosPendientes: async (ids: string[]) => {
      state.calls.push({ kind: "sync", input: ids });
      if (state.fallaSincronizacion) {
        throw new Error("Zoom no responde");
      }
      return state.sincronizacion;
    },
  }),
}));

import { POST } from "../app/api/v1/reuniones/cancelar-serie/route";

const peticion = () =>
  new Request("http://localhost/api/v1/reuniones/cancelar-serie", {
    method: "POST",
    body: JSON.stringify({ solicitudIds: ["s1"] }),
  });

beforeEach(() => {
  state.calls = [];
  state.eventoIds = ["zoom-1", "meet-historico-1"];
  state.sincronizacion = [{ estado: "SINCRONIZADA" }];
  state.fallaSincronizacion = false;
});

describe("POST /reuniones/cancelar-serie", () => {
  it("sincroniza de inmediato los eventos de Zoom y el histórico de Meet de la serie", async () => {
    const respuesta = (await POST(peticion())) as unknown as {
      body: { message: string };
      status: number;
    };
    expect(state.calls.map(({ kind }) => kind)).toEqual(["cancelar", "sync"]);
    expect(state.calls[1].input).toEqual(["zoom-1", "meet-historico-1"]);
    expect(respuesta.status).toBe(200);
    expect(respuesta.body.message).toBe("La serie se canceló y se eliminó de Zoom.");
  });

  it("si Zoom deja pendientes, responde 202 y lo dice sin ocultar la cancelación", async () => {
    state.sincronizacion = [{ estado: "SINCRONIZADA" }, { estado: "ERROR" }];
    const respuesta = (await POST(peticion())) as unknown as {
      body: { message: string };
      status: number;
    };
    expect(respuesta.status).toBe(202);
    expect(respuesta.body.message).toContain("quedó registrada");
    expect(respuesta.body.message).toContain("pendientes");
  });

  it("si la sincronización falla, la cancelación local ya hecha no se convierte en error", async () => {
    state.fallaSincronizacion = true;
    const respuesta = (await POST(peticion())) as unknown as {
      body: { message: string };
      status: number;
    };
    expect(respuesta.status).toBe(202);
    expect(respuesta.body.message).toContain("pendientes");
  });

  it("no sincroniza si no hay eventos externos", async () => {
    state.eventoIds = [];
    const respuesta = (await POST(peticion())) as unknown as { status: number };
    expect(state.calls.map(({ kind }) => kind)).toEqual(["cancelar"]);
    expect(respuesta.status).toBe(200);
  });
});
