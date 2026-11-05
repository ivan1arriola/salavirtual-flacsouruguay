import { beforeEach, describe, expect, it, vi } from "vitest";

type CuentaMock = Record<string, unknown> & { id: string; proveedor: { tipo: string } };

const state = vi.hoisted(() => ({
  created: [] as Array<Record<string, unknown>>,
  updated: [] as Array<{ where: { id: string }; data: Record<string, unknown> }>,
  deleted: [] as string[],
  audits: [] as Array<Record<string, unknown>>,
  cuentas: new Map<string, CuentaMock>(),
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
      findUnique: async ({ where }: { where: { id: string } }) => state.cuentas.get(where.id) ?? null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        state.created.push(data);
        return { id: "host-id", ...data };
      },
      update: async (args: { where: { id: string }; data: Record<string, unknown> }) => {
        state.updated.push(args);
        return { ...state.cuentas.get(args.where.id), ...args.data };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        state.deleted.push(where.id);
        return state.cuentas.get(where.id);
      },
    },
    eventoProveedor: { count: async () => 0 },
    auditoria: { create: async ({ data }: { data: Record<string, unknown> }) => { state.audits.push(data); } },
  };
  return { db: { $transaction: async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx) } };
});

import { DELETE, POST, PUT } from "../app/api/v1/configuracion/salas-meet/route";

const MENSAJE_ZOOM = "Las cuentas de Zoom vienen del grupo elegido en Configuración.";

const base = {
  nombre: "Sala 09", email: "SALA09@flacso.edu.uy", prioridad: 9,
  limiteConcurrente: 1, tieneLicencia: true, activa: true,
};

function cuenta(id: string, tipo: "ZOOM" | "GOOGLE_MEET"): CuentaMock {
  return {
    id,
    proveedorId: tipo,
    proveedor: { tipo },
    nombre: `Cuenta ${id}`,
    emailOrganizador: `${id}@flacso.edu.uy`,
    externalAccountId: tipo === "ZOOM" ? `zoom-user-${id}` : `${id}@flacso.edu.uy`,
    secretRef: tipo === "ZOOM" ? null : "encrypted:clave-actual",
    prioridad: 5,
    limiteConcurrente: 1,
    tieneLicencia: true,
    activa: true,
    _count: { eventosProveedor: 0 },
  };
}

function request(body: Record<string, unknown>, method = "POST") {
  return new Request("http://localhost/api/v1/configuracion/salas-meet", {
    method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
}

beforeEach(() => {
  state.created = [];
  state.updated = [];
  state.deleted = [];
  state.audits = [];
  state.cuentas = new Map([
    ["zoom-1", cuenta("zoom-1", "ZOOM")],
    ["meet-1", cuenta("meet-1", "GOOGLE_MEET")],
  ]);
});

describe("alta de cuentas organizadoras", () => {
  it("crear una cuenta Zoom responde 409", async () => {
    for (const body of [
      { ...base, proveedorTipo: "ZOOM" },
      { ...base, proveedorTipo: "ZOOM", password: "not-a-zoom-credential" },
      { ...base, proveedorTipo: "ZOOM", limiteConcurrente: 2 },
    ]) {
      const response = await POST(request(body)) as any;

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ error: MENSAJE_ZOOM });
    }
    expect(state.created).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });

  it("sigue exigiendo contraseña para crear una cuenta Google Meet", async () => {
    const response = await POST(request({ ...base, proveedorTipo: "GOOGLE_MEET" })) as any;

    expect(response.status).toBe(400);
    expect(state.created).toHaveLength(0);
  });
});

describe("baja de cuentas organizadoras", () => {
  it("borrar una cuenta Zoom responde 409", async () => {
    const response = await DELETE(request({ id: "zoom-1" }, "DELETE")) as any;

    expect(response.status).toBe(409);
    expect(response.body).toEqual({ error: MENSAJE_ZOOM });
    expect(state.deleted).toHaveLength(0);
    expect(state.audits).toHaveLength(0);
  });
});

describe("cuentas Meet", () => {
  it("crear y borrar cuentas Meet sigue funcionando", async () => {
    const creada = await POST(request({ ...base, proveedorTipo: "GOOGLE_MEET", password: "clave-segura" })) as any;

    expect(creada.status).toBe(201);
    expect(creada.body.message).toBe("Sala Meet agregada.");
    expect(state.created[0]).toMatchObject({
      proveedorId: "GOOGLE_MEET", emailOrganizador: "sala09@flacso.edu.uy", secretRef: "encrypted:clave-segura",
    });
    expect(state.audits[0]).toMatchObject({ accion: "CUENTA_MEET_CREADA" });

    const borrada = await DELETE(request({ id: "meet-1" }, "DELETE")) as any;

    expect(borrada.status).toBe(200);
    expect(state.deleted).toEqual(["meet-1"]);
    expect(state.audits[1]).toMatchObject({ accion: "CUENTA_MEET_ELIMINADA", entidadId: "meet-1" });
  });

  it("editar una cuenta Meet sigue cambiando nombre, correo y licencia", async () => {
    const response = await PUT(request({
      ...base, id: "meet-1", proveedorTipo: "GOOGLE_MEET", nombre: "Sala renombrada",
      email: "meet-1@flacso.edu.uy", tieneLicencia: false, prioridad: 3,
    }, "PUT")) as any;

    expect(response.status).toBe(200);
    expect(state.updated[0].data).toMatchObject({
      nombre: "Sala renombrada", emailOrganizador: "meet-1@flacso.edu.uy", tieneLicencia: false, prioridad: 3,
    });
  });
});

describe("edición de cuentas Zoom", () => {
  it("editar una cuenta Zoom solo cambia prioridad y activa", async () => {
    const response = await PUT(request({
      ...base, id: "zoom-1", proveedorTipo: "ZOOM", nombre: "Otro nombre", email: "otro@flacso.edu.uy",
      tieneLicencia: false, prioridad: 2, activa: false, notificarCambioPassword: false,
    }, "PUT")) as any;

    expect(response.status).toBe(200);
    expect(state.updated).toHaveLength(1);
    expect(state.updated[0]).toEqual({ where: { id: "zoom-1" }, data: { prioridad: 2, activa: false } });
    expect(response.body.host).toMatchObject({
      nombre: "Cuenta zoom-1", emailOrganizador: "zoom-1@flacso.edu.uy", tieneLicencia: true,
      limiteConcurrente: 1, prioridad: 2, activa: false,
    });
    expect(state.audits[0]).toMatchObject({
      actorUsuarioId: "admin", accion: "CUENTA_ZOOM_ACTUALIZADA", entidadId: "zoom-1",
      valorAnterior: { prioridad: 5, activa: true }, valorNuevo: { prioridad: 2, activa: false },
    });
  });

  it("editar una cuenta Zoom acepta solo prioridad y activa", async () => {
    const response = await PUT(request({ id: "zoom-1", proveedorTipo: "ZOOM", prioridad: 7, activa: true }, "PUT")) as any;

    expect(response.status).toBe(200);
    expect(state.updated[0].data).toEqual({ prioridad: 7, activa: true });
  });

  it("editar una cuenta Zoom sigue rechazando dos reuniones simultáneas o una contraseña", async () => {
    const dosReuniones = await PUT(request({ ...base, id: "zoom-1", proveedorTipo: "ZOOM", limiteConcurrente: 2 }, "PUT")) as any;
    const conPassword = await PUT(request({ ...base, id: "zoom-1", proveedorTipo: "ZOOM", password: "clave-secreta" }, "PUT")) as any;

    expect(dosReuniones.status).toBe(400);
    expect(conPassword.status).toBe(400);
    expect(state.updated).toHaveLength(0);
  });

  it("no se puede editar una cuenta Zoom como si fuera Meet", async () => {
    const response = await PUT(request({ ...base, id: "zoom-1", proveedorTipo: "GOOGLE_MEET" }, "PUT")) as any;

    expect(response.status).toBe(400);
    expect(state.updated).toHaveLength(0);
  });
});
