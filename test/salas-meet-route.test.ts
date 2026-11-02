import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  audits: [] as Array<Record<string, unknown>>,
}));

vi.mock("next/server", () => ({
  NextResponse: class {
    constructor(public body: unknown, public status = 200) {}
    static json(body: unknown, init?: { status?: number }) {
      return new this(body, init?.status ?? 200);
    }
  },
}));
vi.mock("@/auth", () => ({ auth: async () => ({ user: { id: "admin", email: "admin@flacso.edu.uy", role: "ADMINISTRACION" } }) }));
vi.mock("@/src/lib/auth/session-actor.adapter", () => ({
  resolveSessionActor: async () => ({ id: "admin", rol: "ADMINISTRACION", activo: true }),
}));
vi.mock("@/src/lib/config/encryption", () => ({
  cifrarConfiguracion: (value: string) => `encrypted:${value}`,
  descifrarConfiguracion: (value: string) => value.replace(/^encrypted:/, ""),
}));
vi.mock("@/src/modules/notificaciones/notificaciones.service", () => ({ notificarUsuarios: async () => {} }));
vi.mock("@/src/lib/db", () => {
  const tx = {
    proveedorReunion: { upsert: async ({ where }: { where: { tipo: string } }) => ({ id: where.tipo }) },
    cuentaProveedor: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data);
        return { id: "host-id", ...data };
      },
    },
    auditoria: { create: async ({ data }: { data: Record<string, unknown> }) => { state.audits.push(data); } },
  };
  return { db: { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } };
});

import { POST } from "../app/api/v1/configuracion/salas-meet/route";

const base = {
  nombre: "Sala 09", email: "SALA09@flacso.edu.uy", prioridad: 9,
  limiteConcurrente: 1, tieneLicencia: true, activa: true,
};

function request(body: Record<string, unknown>) {
  return new Request("http://localhost/api/v1/configuracion/salas-meet", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => { state.created = []; state.audits = []; });

describe("alta de cuentas organizadoras", () => {
  it("crea una cuenta Zoom con el OAuth institucional, sin contraseña individual", async () => {
    const response = await POST(request({ ...base, proveedorTipo: "ZOOM" })) as any;

    expect(response.status).toBe(201);
    expect(response.body.message).toContain("Zoom");
    expect(state.created).toHaveLength(1);
    expect(state.created[0]).toMatchObject({
      proveedorId: "ZOOM", emailOrganizador: "sala09@flacso.edu.uy", secretRef: null,
    });
    expect(state.audits[0].valorNuevo).toMatchObject({ passwordConfigurada: false });
  });

  it("sigue exigiendo contraseña para crear una cuenta Google Meet", async () => {
    const response = await POST(request({ ...base, proveedorTipo: "GOOGLE_MEET" })) as any;

    expect(response.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });

  it("rechaza una contraseña individual para una cuenta Zoom", async () => {
    const response = await POST(request({ ...base, proveedorTipo: "ZOOM", password: "not-a-zoom-credential" })) as any;

    expect(response.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });

  it("rechaza configurar dos reuniones simultáneas para una cuenta Zoom", async () => {
    const response = await POST(request({ ...base, proveedorTipo: "ZOOM", limiteConcurrente: 2 })) as any;
    expect(response.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });
});
