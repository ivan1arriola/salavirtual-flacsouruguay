import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";

const zoom = vi.hoisted(() => ({
  token: vi.fn(),
  miembros: vi.fn(),
  grupos: vi.fn()
}));

vi.mock("../src/integrations/zoom/zoom-client", () => ({ obtenerZoomAccessToken: zoom.token }));
vi.mock("../src/integrations/zoom/zoom-grupos-client", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../src/integrations/zoom/zoom-grupos-client")>()),
  listarMiembrosGrupoZoomHttp: zoom.miembros,
  listarGruposZoomHttp: zoom.grupos
}));

import { ZoomPermisosError } from "../src/integrations/zoom/zoom-grupos-client";
import {
  elegirGrupoZoom,
  listarGruposZoom,
  previsualizarSincronizacionConGrupo,
  sincronizarCuentasZoomConGrupo
} from "../src/modules/configuracion/zoom-grupo-sincronizacion.service";

const ahora = new Date("2026-11-05T12:00:00Z");
const minutosAntes = (minutos: number) => new Date(ahora.getTime() - minutos * 60_000);
const PROVEEDORES: Record<string, string> = { ZOOM: "prov-zoom", GOOGLE_MEET: "prov-meet" };
const descifrar = (cifrado: string) => `plano:${cifrado}`;

type Cuenta = {
  id: string;
  proveedorId: string;
  nombre: string;
  emailOrganizador: string | null;
  externalAccountId: string | null;
  prioridad: number;
  tieneLicencia: boolean;
  limiteConcurrente: number | null;
  activa: boolean;
  origenGrupoZoom: boolean;
  fueraDelGrupoAt: Date | null;
};

type Config = {
  id: string;
  activa: boolean;
  accountId: string | null;
  clientId: string | null;
  clientSecretCifrado: string | null;
  grupoId: string | null;
  grupoNombre: string | null;
  ultimaSincronizacionAt: Date | null;
  ultimaSincronizacionResultado: string | null;
  sincronizandoDesdeAt: Date | null;
  actualizadaPorId: string | null;
};

function cuentaZoom(id: string, email: string, extra: Partial<Cuenta> = {}): Cuenta {
  return {
    id,
    proveedorId: PROVEEDORES.ZOOM,
    nombre: `Sala ${id}`,
    emailOrganizador: email,
    externalAccountId: email,
    prioridad: 1,
    tieneLicencia: true,
    limiteConcurrente: 1,
    activa: true,
    origenGrupoZoom: false,
    fueraDelGrupoAt: null,
    ...extra
  };
}

function miembro(id: string, email: string, licenciado = true) {
  return { id, email, nombre: `Persona ${id}`, licenciado };
}

/** Condiciones de `where` que usa el servicio sobre ConfiguracionZoom. */
function cumpleCampo(valor: unknown, condicion: unknown): boolean {
  if (condicion === null) return valor === null;
  if (condicion instanceof Date) return valor instanceof Date && valor.getTime() === condicion.getTime();
  if (condicion && typeof condicion === "object" && "lt" in condicion) {
    return valor instanceof Date && valor < (condicion as { lt: Date }).lt;
  }
  return valor === condicion;
}

function elegirCampos<T extends Record<string, unknown>>(fila: T, select?: Record<string, boolean>): Partial<T> {
  if (!select) return { ...fila };
  return Object.fromEntries(Object.keys(select).filter((campo) => select[campo]).map((campo) => [campo, fila[campo]])) as Partial<T>;
}

/** Igual que `@@unique([proveedorId, externalAccountId])` del esquema. */
function exigirIdExternoUnico(cuentas: readonly Cuenta[], candidata: Cuenta): void {
  const choque = cuentas.find(
    (c) =>
      c.id !== candidata.id &&
      candidata.externalAccountId !== null &&
      c.proveedorId === candidata.proveedorId &&
      c.externalAccountId === candidata.externalAccountId
  );
  if (choque) throw new Error("Unique constraint failed on the fields: (`proveedorId`,`externalAccountId`)");
}

function coincide(fila: Record<string, unknown>, where: Record<string, unknown>): boolean {
  return Object.entries(where).every(([campo, condicion]) =>
    campo === "OR"
      ? (condicion as Record<string, unknown>[]).some((alternativa) => coincide(fila, alternativa))
      : cumpleCampo(fila[campo], condicion)
  );
}

/** Base en memoria con las operaciones de Prisma que usa el servicio. */
function crearBase(opciones: {
  cuentas?: Cuenta[];
  config?: Partial<Config> | null;
  reunionesFuturas?: Record<string, number>;
} = {}) {
  const config: Config | null = opciones.config === null ? null : {
    id: "principal",
    activa: true,
    accountId: "acc",
    clientId: "cli",
    clientSecretCifrado: "secreto",
    grupoId: "g1",
    grupoNombre: "Salas Zoom",
    ultimaSincronizacionAt: null,
    ultimaSincronizacionResultado: null,
    sincronizandoDesdeAt: null,
    actualizadaPorId: null,
    ...opciones.config
  };
  const estado = { config };
  const cuentas = (opciones.cuentas ?? []).map((c) => ({ ...c }));
  const auditorias: Record<string, any>[] = [];
  let creadas = 0;

  const tx = {
    $executeRaw: vi.fn(async () => 1),
    proveedorReunion: {
      findUnique: vi.fn(async ({ where }: any) => (PROVEEDORES[where.tipo] ? { id: PROVEEDORES[where.tipo] } : null))
    },
    cuentaProveedor: {
      findMany: vi.fn(async ({ where, select }: any = {}) =>
        cuentas
          .filter((c) => where?.proveedorId === undefined || c.proveedorId === where.proveedorId)
          .map((c) => elegirCampos(c, select))
      ),
      create: vi.fn(async ({ data }: any) => {
        const nueva: Cuenta = {
          id: `nueva-${++creadas}`,
          emailOrganizador: null,
          externalAccountId: null,
          prioridad: 100,
          tieneLicencia: false,
          limiteConcurrente: null,
          activa: true,
          origenGrupoZoom: false,
          fueraDelGrupoAt: null,
          ...data
        };
        exigirIdExternoUnico(cuentas, nueva);
        cuentas.push(nueva);
        return { ...nueva };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const cuenta = cuentas.find((c) => c.id === where.id);
        if (!cuenta) throw new Error(`No existe la cuenta ${where.id}`);
        exigirIdExternoUnico(cuentas, { ...cuenta, ...data });
        Object.assign(cuenta, data);
        return { ...cuenta };
      })
    },
    eventoProveedor: {
      groupBy: vi.fn(async (_consulta: unknown) =>
        Object.entries(opciones.reunionesFuturas ?? {}).map(([cuentaProveedorId, cantidad]) => ({
          cuentaProveedorId,
          _count: { _all: cantidad }
        }))
      )
    },
    configuracionZoom: {
      findUnique: vi.fn(async () => (estado.config ? { ...estado.config } : null)),
      update: vi.fn(async ({ data }: any) => {
        if (!estado.config) throw new Error("No existe la configuración");
        Object.assign(estado.config, data);
        return { ...estado.config };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (!estado.config || !coincide(estado.config, where)) return { count: 0 };
        Object.assign(estado.config, data);
        return { count: 1 };
      }),
      upsert: vi.fn(async ({ create, update }: any) => {
        estado.config = estado.config
          ? Object.assign(estado.config, update)
          : ({ ...crearBase({}).estado.config, grupoId: null, grupoNombre: null, ...create } as Config);
        return { ...estado.config };
      })
    },
    auditoria: {
      create: vi.fn(async ({ data }: any) => {
        auditorias.push(data);
        return {};
      })
    }
  };
  const mock = { ...tx, $transaction: vi.fn(async (callback: (t: typeof tx) => unknown) => callback(tx)) };
  return { db: mock as unknown as PrismaClient, mock, estado, cuentas, auditorias };
}

beforeEach(() => {
  vi.clearAllMocks();
  zoom.token.mockResolvedValue("tok");
});

describe("sincronizarCuentasZoomConGrupo", () => {
  it("crea y desactiva según el plan y guarda el resumen", async () => {
    const base = crearBase({
      cuentas: [
        cuentaZoom("z1", "sala01@flacso.edu.uy", { prioridad: 1 }),
        cuentaZoom("z2", "sala02@flacso.edu.uy", { prioridad: 2 }),
        cuentaZoom("z3", "sala03@flacso.edu.uy", { prioridad: 3 }),
        cuentaZoom("z5", "vuelve@flacso.edu.uy", { prioridad: 5, activa: false, fueraDelGrupoAt: minutosAntes(600), origenGrupoZoom: true })
      ],
      reunionesFuturas: { z3: 2 }
    });
    zoom.miembros.mockResolvedValue([
      miembro("u1", "Sala01@FLACSO.edu.uy"),
      miembro("u4", "nueva@flacso.edu.uy", false),
      miembro("u5", "vuelve@flacso.edu.uy")
    ]);

    // Quita 2 de las 3 cuentas que hoy reciben reuniones (z2 y z3): es masiva y se confirma.
    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora, { confirmar: true });

    expect(resultado).toEqual({
      ok: true,
      resumen: "1 nueva, 1 desactivada, 1 fuera del grupo con reuniones, 1 sin licencia"
    });
    expect(zoom.token).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc", clientId: "cli", clientSecret: "plano:secreto" }));
    expect(zoom.miembros).toHaveBeenCalledWith("tok", "g1");

    const porId = Object.fromEntries(base.cuentas.map((c) => [c.id, c]));
    expect(porId["nueva-1"]).toMatchObject({
      proveedorId: PROVEEDORES.ZOOM,
      nombre: "Persona u4",
      emailOrganizador: "nueva@flacso.edu.uy",
      externalAccountId: "u4",
      prioridad: 100, // la que asigna el planificador (Task 2)
      limiteConcurrente: 1,
      activa: true,
      tieneLicencia: false,
      origenGrupoZoom: true,
      fueraDelGrupoAt: null
    });
    // Adopción por correo sin distinguir mayúsculas: conserva la fila (y su prioridad), no la duplica.
    expect(porId.z1).toMatchObject({
      nombre: "Persona u1",
      emailOrganizador: "sala01@flacso.edu.uy",
      externalAccountId: "u1",
      activa: true,
      origenGrupoZoom: true,
      fueraDelGrupoAt: null,
      tieneLicencia: true,
      prioridad: 1
    });
    expect(porId.z2).toMatchObject({ activa: false, fueraDelGrupoAt: ahora });
    expect(porId.z3).toMatchObject({ activa: true, fueraDelGrupoAt: ahora });
    expect(porId.z5).toMatchObject({ activa: true, fueraDelGrupoAt: null, prioridad: 5 });
    expect(base.cuentas).toHaveLength(5);

    // Una reunión en curso también protege su cuenta, aunque haya salido del grupo.
    expect(base.mock.eventoProveedor.groupBy).toHaveBeenCalledTimes(1);
    const consulta = base.mock.eventoProveedor.groupBy.mock.calls[0][0] as any;
    expect(consulta.by).toEqual(["cuentaProveedorId"]);
    expect(consulta.where.proveedorId).toBe(PROVEEDORES.ZOOM);
    expect(consulta.where.instancia).toMatchObject({
      OR: [
        { estado: "PROGRAMADA", finProgramadoAt: { gt: ahora } },
        { estado: "EN_CURSO" }
      ]
    });

    expect(base.mock.$transaction).toHaveBeenCalledTimes(1);
    expect(base.estado.config).toMatchObject({
      ultimaSincronizacionAt: ahora,
      ultimaSincronizacionResultado: resultado.resumen,
      sincronizandoDesdeAt: null
    });
    expect(base.auditorias).toHaveLength(1);
    expect(base.auditorias[0]).toMatchObject({
      actorUsuarioId: null,
      accion: "CUENTAS_ZOOM_SINCRONIZADAS",
      entidadTipo: "ConfiguracionZoom",
      entidadId: "principal",
      valorNuevo: expect.objectContaining({
        grupoId: "g1",
        resumen: resultado.resumen,
        sinLicencia: ["nueva@flacso.edu.uy"],
        pasanASinLicencia: []
      })
    });
  });

  it("una sincronización masiva sin confirmar no cambia nada y conserva el último resultado", async () => {
    const original = [
      cuentaZoom("z1", "sala01@flacso.edu.uy", { prioridad: 1 }),
      cuentaZoom("z2", "sala02@flacso.edu.uy", { prioridad: 2 }),
      cuentaZoom("z3", "sala03@flacso.edu.uy", { prioridad: 3 }),
      cuentaZoom("z4", "sala04@flacso.edu.uy", { prioridad: 4 })
    ];
    const previa = minutosAntes(60);
    const base = crearBase({
      cuentas: original,
      reunionesFuturas: { z2: 1 },
      config: { ultimaSincronizacionAt: previa, ultimaSincronizacionResultado: "0 nuevas, 0 desactivadas, 0 fuera del grupo con reuniones" }
    });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    expect(resultado).toEqual({
      ok: false,
      resumen: "Esta sincronización cambiaría muchas cuentas (3 de 4). Revisá la vista previa y confirmá para continuar."
    });
    expect(base.cuentas).toEqual(original);
    expect(base.mock.cuentaProveedor.create).not.toHaveBeenCalled();
    expect(base.mock.cuentaProveedor.update).not.toHaveBeenCalled();
    expect(base.auditorias).toEqual([]);
    expect(base.mock.configuracionZoom.update).not.toHaveBeenCalled();
    expect(base.estado.config).toMatchObject({
      ultimaSincronizacionAt: previa,
      ultimaSincronizacionResultado: "0 nuevas, 0 desactivadas, 0 fuera del grupo con reuniones",
      sincronizandoDesdeAt: null
    });
  });

  it("una sincronización masiva confirmada se aplica", async () => {
    const base = crearBase({
      cuentas: [
        cuentaZoom("z1", "sala01@flacso.edu.uy", { prioridad: 1 }),
        cuentaZoom("z2", "sala02@flacso.edu.uy", { prioridad: 2 }),
        cuentaZoom("z3", "sala03@flacso.edu.uy", { prioridad: 3 }),
        cuentaZoom("z4", "sala04@flacso.edu.uy", { prioridad: 4 })
      ],
      reunionesFuturas: { z2: 1 }
    });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora, { confirmar: true });

    expect(resultado).toEqual({ ok: true, resumen: "0 nuevas, 2 desactivadas, 1 fuera del grupo con reuniones" });
    const porId = Object.fromEntries(base.cuentas.map((c) => [c.id, c]));
    expect(porId.z2).toMatchObject({ activa: true, fueraDelGrupoAt: ahora });
    expect(porId.z3).toMatchObject({ activa: false, fueraDelGrupoAt: ahora });
    expect(porId.z4).toMatchObject({ activa: false, fueraDelGrupoAt: ahora });
    expect(base.estado.config?.ultimaSincronizacionResultado).toBe(resultado.resumen);
  });

  it("el temporizador no crea una sala nueva sin revisión administrativa", async () => {
    const base = crearBase({ cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    zoom.miembros.mockResolvedValue([
      miembro("u1", "sala01@flacso.edu.uy"),
      miembro("u2", "nueva@flacso.edu.uy")
    ]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora, { actorId: null });

    expect(resultado).toEqual({
      ok: false,
      resumen: "Hay 1 cuenta nueva de Zoom. Revisá la vista previa y confirmá desde Configuración."
    });
    expect(base.cuentas).toHaveLength(1);
    expect(base.auditorias).toEqual([]);
  });

  it("quitar exactamente la mitad de las cuentas no pide confirmación", async () => {
    const base = crearBase({
      cuentas: [
        cuentaZoom("z1", "sala01@flacso.edu.uy", { prioridad: 1 }),
        cuentaZoom("z2", "sala02@flacso.edu.uy", { prioridad: 2 }),
        cuentaZoom("z3", "sala03@flacso.edu.uy", { prioridad: 3 }),
        cuentaZoom("z4", "sala04@flacso.edu.uy", { prioridad: 4 })
      ]
    });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy"), miembro("u2", "sala02@flacso.edu.uy")]);

    expect(await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora)).toEqual({
      ok: true,
      resumen: "0 nuevas, 2 desactivadas, 0 fuera del grupo con reuniones"
    });
  });

  it("registra en la auditoría quién pidió la sincronización", async () => {
    const base = crearBase({ cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);

    await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora, { actorId: "admin-1" });
    await sincronizarCuentasZoomConGrupo(base.db, descifrar, new Date(ahora.getTime() + 60_000), { actorId: null });
    await sincronizarCuentasZoomConGrupo(base.db, descifrar, new Date(ahora.getTime() + 120_000));

    expect(base.auditorias.map(({ actorUsuarioId }) => actorUsuarioId)).toEqual(["admin-1", null, null]);
  });

  it("informa los miembros sin licencia y las cuentas que la pierden", async () => {
    const base = crearBase({
      cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy"), cuentaZoom("z2", "sala02@flacso.edu.uy")]
    });
    zoom.miembros.mockResolvedValue([
      miembro("u1", "sala01@flacso.edu.uy", false),
      miembro("u2", "sala02@flacso.edu.uy"),
      miembro("u3", "nueva@flacso.edu.uy", false)
    ]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    const resumen = "1 nueva, 0 desactivadas, 0 fuera del grupo con reuniones, 2 sin licencia (1 pasa a sin licencia)";
    expect(resultado).toEqual({ ok: true, resumen });
    expect(base.cuentas.find((c) => c.id === "z1")).toMatchObject({ tieneLicencia: false });
    expect(base.estado.config?.ultimaSincronizacionResultado).toBe(resumen);
    expect(base.auditorias[0].valorNuevo).toMatchObject({
      resumen,
      sinLicencia: ["sala01@flacso.edu.uy", "nueva@flacso.edu.uy"],
      pasanASinLicencia: ["z1"]
    });
  });

  it("conserva la fecha en que una cuenta salió del grupo", async () => {
    const salio = minutosAntes(120);
    const base = crearBase({
      cuentas: [
        cuentaZoom("z1", "sala01@flacso.edu.uy"),
        cuentaZoom("z3", "sala03@flacso.edu.uy", { fueraDelGrupoAt: salio }),
        cuentaZoom("z4", "sala04@flacso.edu.uy", { fueraDelGrupoAt: salio })
      ],
      reunionesFuturas: { z3: 1 }
    });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    expect(resultado.resumen).toBe("0 nuevas, 1 desactivada, 1 fuera del grupo con reuniones");
    const porId = Object.fromEntries(base.cuentas.map((c) => [c.id, c]));
    expect(porId.z3).toMatchObject({ activa: true, fueraDelGrupoAt: salio });
    expect(porId.z4).toMatchObject({ activa: false, fueraDelGrupoAt: salio });
  });

  it("un error de Zoom no cambia ninguna cuenta y guarda el error", async () => {
    const original = [cuentaZoom("z1", "sala01@flacso.edu.uy"), cuentaZoom("z2", "sala02@flacso.edu.uy")];
    const base = crearBase({ cuentas: original });
    zoom.miembros.mockRejectedValue(new ZoomPermisosError());

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    const mensaje = "Falta permiso en la app de Zoom: group:read:list_groups:admin y group_member:read:list_members:admin.";
    expect(resultado).toEqual({ ok: false, resumen: mensaje });
    expect(base.cuentas).toEqual(original);
    expect(base.mock.cuentaProveedor.create).not.toHaveBeenCalled();
    expect(base.mock.cuentaProveedor.update).not.toHaveBeenCalled();
    expect(base.mock.$transaction).not.toHaveBeenCalled();
    expect(base.auditorias).toEqual([]);
    expect(base.estado.config).toMatchObject({
      ultimaSincronizacionAt: ahora,
      ultimaSincronizacionResultado: mensaje,
      sincronizandoDesdeAt: null
    });
  });

  it("grupo vacío no desactiva nada", async () => {
    const original = [cuentaZoom("z1", "sala01@flacso.edu.uy"), cuentaZoom("z2", "sala02@flacso.edu.uy")];
    const base = crearBase({ cuentas: original });
    zoom.miembros.mockResolvedValue([]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    expect(resultado).toEqual({ ok: false, resumen: "El grupo de Zoom no tiene miembros." });
    expect(base.cuentas).toEqual(original);
    expect(base.mock.cuentaProveedor.update).not.toHaveBeenCalled();
    expect(base.mock.cuentaProveedor.create).not.toHaveBeenCalled();
    // Se rechaza antes de abrir la transacción: ni siquiera toma el candado de reserva de salas.
    expect(base.mock.$transaction).not.toHaveBeenCalled();
    expect(base.mock.$executeRaw).not.toHaveBeenCalled();
    expect(base.estado.config).toMatchObject({
      ultimaSincronizacionAt: ahora,
      ultimaSincronizacionResultado: "El grupo de Zoom no tiene miembros.",
      sincronizandoDesdeAt: null
    });
  });

  it("un miembro que cambió su correo en Zoom actualiza su cuenta sin chocar con el id externo", async () => {
    const base = crearBase({
      cuentas: [cuentaZoom("z1", "viejo@flacso.edu.uy", { externalAccountId: "u1", origenGrupoZoom: true })]
    });
    zoom.miembros.mockResolvedValue([miembro("u1", "nuevo@flacso.edu.uy")]);

    const primera = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);
    const segunda = await sincronizarCuentasZoomConGrupo(base.db, descifrar, new Date(ahora.getTime() + 60_000));

    const sinCambios = "0 nuevas, 0 desactivadas, 0 fuera del grupo con reuniones";
    expect(primera).toEqual({ ok: true, resumen: sinCambios });
    expect(segunda).toEqual({ ok: true, resumen: sinCambios });
    expect(base.mock.cuentaProveedor.create).not.toHaveBeenCalled();
    expect(base.cuentas).toHaveLength(1);
    expect(base.cuentas[0]).toMatchObject({
      id: "z1",
      emailOrganizador: "nuevo@flacso.edu.uy",
      externalAccountId: "u1",
      activa: true,
      fueraDelGrupoAt: null
    });
  });

  it("un error inesperado de la base guarda un aviso legible y registra el original", async () => {
    const original = [cuentaZoom("z1", "sala01@flacso.edu.uy")];
    const base = crearBase({ cuentas: original });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy"), miembro("u2", "nueva@flacso.edu.uy")]);
    const falla = new Error("Invalid `prisma.cuentaProveedor.create()` invocation: connection reset");
    base.mock.cuentaProveedor.create.mockRejectedValueOnce(falla);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    const aviso = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo más tarde.";
    expect(resultado).toEqual({ ok: false, resumen: aviso });
    expect(base.estado.config).toMatchObject({
      ultimaSincronizacionAt: ahora,
      ultimaSincronizacionResultado: aviso,
      sincronizandoDesdeAt: null
    });
    expect(consola).toHaveBeenCalledWith(expect.any(String), falla);
    consola.mockRestore();
  });

  it("sin proveedor Zoom avisa con un mensaje claro", async () => {
    const base = crearBase({ cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    base.mock.proveedorReunion.findUnique.mockResolvedValueOnce(null);
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    expect(resultado).toEqual({ ok: false, resumen: "El proveedor Zoom no está configurado." });
    expect(base.estado.config?.ultimaSincronizacionResultado).toBe("El proveedor Zoom no está configurado.");
  });

  it("sin grupo elegido avisa", async () => {
    const aviso = { ok: false, resumen: "Elegí un grupo de Zoom para obtener las cuentas anfitrionas." };
    const sinGrupo = crearBase({ config: { grupoId: null, grupoNombre: null } });
    const sinConfiguracion = crearBase({ config: null });

    expect(await sincronizarCuentasZoomConGrupo(sinGrupo.db, descifrar, ahora)).toEqual(aviso);
    expect(await sincronizarCuentasZoomConGrupo(sinConfiguracion.db, descifrar, ahora)).toEqual(aviso);

    expect(zoom.token).not.toHaveBeenCalled();
    expect(zoom.miembros).not.toHaveBeenCalled();
    expect(sinGrupo.mock.configuracionZoom.updateMany).not.toHaveBeenCalled();
    expect(sinGrupo.mock.configuracionZoom.update).not.toHaveBeenCalled();
    expect(sinGrupo.estado.config).toMatchObject({
      sincronizandoDesdeAt: null,
      ultimaSincronizacionAt: null,
      ultimaSincronizacionResultado: null
    });
  });

  it("una segunda sincronización simultánea se rechaza", async () => {
    const base = crearBase({ cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    let entregarMiembros: (miembros: unknown[]) => void = () => {};
    zoom.miembros.mockImplementationOnce(() => new Promise((resolve) => { entregarMiembros = resolve; }));

    const primera = sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);
    await vi.waitFor(() => expect(zoom.miembros).toHaveBeenCalledTimes(1));
    expect(base.estado.config?.sincronizandoDesdeAt).toEqual(ahora);

    const segunda = await sincronizarCuentasZoomConGrupo(base.db, descifrar, new Date(ahora.getTime() + 60_000));

    expect(segunda).toEqual({ ok: false, resumen: "Ya hay una sincronización en curso." });
    expect(zoom.miembros).toHaveBeenCalledTimes(1);
    expect(base.estado.config).toMatchObject({
      sincronizandoDesdeAt: ahora,
      ultimaSincronizacionAt: null,
      ultimaSincronizacionResultado: null
    });

    entregarMiembros([miembro("u1", "sala01@flacso.edu.uy")]);
    expect(await primera).toEqual({ ok: true, resumen: "0 nuevas, 0 desactivadas, 0 fuera del grupo con reuniones" });
    expect(base.mock.$transaction).toHaveBeenCalledTimes(1);
    expect(base.estado.config?.sincronizandoDesdeAt).toBeNull();
  });

  it("un candado de más de 10 minutos se da por abandonado", async () => {
    const reciente = crearBase({ config: { sincronizandoDesdeAt: minutosAntes(9) } });
    const abandonado = crearBase({ config: { sincronizandoDesdeAt: minutosAntes(11) } });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);

    expect(await sincronizarCuentasZoomConGrupo(reciente.db, descifrar, ahora)).toEqual({
      ok: false,
      resumen: "Ya hay una sincronización en curso."
    });
    expect(reciente.estado.config?.sincronizandoDesdeAt).toEqual(minutosAntes(9));

    expect(await sincronizarCuentasZoomConGrupo(abandonado.db, descifrar, ahora)).toMatchObject({ ok: true });
    expect(abandonado.estado.config?.sincronizandoDesdeAt).toBeNull();
  });

  it("no toca cuentas de Meet con el mismo correo", async () => {
    const meet: Cuenta = {
      ...cuentaZoom("meet1", "ana@flacso.edu.uy"),
      proveedorId: PROVEEDORES.GOOGLE_MEET,
      limiteConcurrente: 3
    };
    const base = crearBase({ cuentas: [meet, cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy"), miembro("u2", "ANA@flacso.edu.uy")]);

    const resultado = await sincronizarCuentasZoomConGrupo(base.db, descifrar, ahora);

    expect(resultado).toMatchObject({ ok: true, resumen: "1 nueva, 0 desactivadas, 0 fuera del grupo con reuniones" });
    expect(base.cuentas.find((c) => c.id === "meet1")).toEqual(meet);
    expect(base.mock.cuentaProveedor.update.mock.calls.map(([args]: any[]) => args.where.id)).not.toContain("meet1");
    expect(base.mock.cuentaProveedor.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ proveedorId: PROVEEDORES.ZOOM }) })
    );
    expect(base.cuentas.find((c) => c.id === "nueva-1")).toMatchObject({
      proveedorId: PROVEEDORES.ZOOM,
      emailOrganizador: "ana@flacso.edu.uy",
      externalAccountId: "u2"
    });
  });
});

describe("grupo de Zoom elegido", () => {
  it("lista los grupos con el token de las credenciales de Zoom", async () => {
    const base = crearBase();
    zoom.grupos.mockResolvedValue([{ id: "g1", nombre: "Salas Zoom", totalMiembros: 9 }]);

    expect(await listarGruposZoom(base.db, descifrar)).toEqual([{ id: "g1", nombre: "Salas Zoom", totalMiembros: 9 }]);
    expect(zoom.token).toHaveBeenCalledWith(expect.objectContaining({ accountId: "acc", clientSecret: "plano:secreto" }));
    expect(zoom.grupos).toHaveBeenCalledWith("tok");
  });

  it("elegir otro grupo lo guarda, borra el resultado del grupo anterior y lo audita", async () => {
    const base = crearBase({
      config: { grupoId: "viejo", grupoNombre: "Viejo", ultimaSincronizacionAt: minutosAntes(60), ultimaSincronizacionResultado: "3 nuevas" }
    });

    await elegirGrupoZoom(base.db, { grupoId: "g2", grupoNombre: "Anfitriones", actorId: "admin" });

    expect(base.mock.configuracionZoom.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "principal" },
        create: expect.objectContaining({ id: "principal", grupoId: "g2", grupoNombre: "Anfitriones" })
      })
    );
    expect(base.estado.config).toMatchObject({
      grupoId: "g2",
      grupoNombre: "Anfitriones",
      actualizadaPorId: "admin",
      accountId: "acc",
      ultimaSincronizacionAt: null,
      ultimaSincronizacionResultado: null
    });
    expect(base.auditorias).toEqual([
      expect.objectContaining({
        actorUsuarioId: "admin",
        accion: "GRUPO_ZOOM_ELEGIDO",
        entidadTipo: "ConfiguracionZoom",
        entidadId: "principal",
        valorNuevo: { grupoId: "g2", grupoNombre: "Anfitriones" }
      })
    ]);
  });

  it("volver a guardar el mismo grupo conserva el resultado de la última sincronización", async () => {
    const ultima = minutosAntes(60);
    const base = crearBase({
      config: { grupoId: "g1", grupoNombre: "Salas Zoom", ultimaSincronizacionAt: ultima, ultimaSincronizacionResultado: "3 nuevas" }
    });

    await elegirGrupoZoom(base.db, { grupoId: "g1", grupoNombre: "Salas Zoom (renombrado)", actorId: "admin" });

    expect(base.estado.config).toMatchObject({
      grupoId: "g1",
      grupoNombre: "Salas Zoom (renombrado)",
      ultimaSincronizacionAt: ultima,
      ultimaSincronizacionResultado: "3 nuevas"
    });
  });
});

describe("previsualizarSincronizacionConGrupo", () => {
  function sinEscrituras(base: ReturnType<typeof crearBase>) {
    expect(base.mock.cuentaProveedor.create).not.toHaveBeenCalled();
    expect(base.mock.cuentaProveedor.update).not.toHaveBeenCalled();
    expect(base.mock.configuracionZoom.update).not.toHaveBeenCalled();
    expect(base.mock.configuracionZoom.updateMany).not.toHaveBeenCalled();
    expect(base.mock.configuracionZoom.upsert).not.toHaveBeenCalled();
    expect(base.mock.$transaction).not.toHaveBeenCalled();
    expect(base.mock.$executeRaw).not.toHaveBeenCalled();
    expect(base.auditorias).toEqual([]);
  }

  const vacia = { masivo: false, avisoMasivo: null, crear: [], desactivar: [], marcarFuera: [], sinLicencia: [], pierdenLicencia: [] };

  it("describe lo que cambiaría sin escribir nada ni tomar el candado", async () => {
    const original = [
      cuentaZoom("z1", "sala01@flacso.edu.uy", { prioridad: 1 }),
      cuentaZoom("z2", "sala02@flacso.edu.uy", { prioridad: 2 }),
      cuentaZoom("z3", "sala03@flacso.edu.uy", { prioridad: 3 }),
      cuentaZoom("z4", "sala04@flacso.edu.uy", { prioridad: 4 })
    ];
    const base = crearBase({
      cuentas: original,
      reunionesFuturas: { z3: 2 },
      config: { ultimaSincronizacionAt: minutosAntes(60), ultimaSincronizacionResultado: "previo" }
    });
    const configAntes = { ...base.estado.config };
    zoom.miembros.mockResolvedValue([
      miembro("u1", "sala01@flacso.edu.uy"),
      miembro("u4", "Sala04@flacso.edu.uy", false),
      miembro("u5", "nueva@flacso.edu.uy", false)
    ]);

    const vista = await previsualizarSincronizacionConGrupo(base.db, descifrar, ahora);

    expect(vista).toEqual({
      ok: true,
      resumen: "1 nueva, 1 desactivada, 1 fuera del grupo con reuniones, 2 sin licencia (1 pasa a sin licencia)",
      masivo: false,
      avisoMasivo: null,
      crear: ["nueva@flacso.edu.uy"],
      desactivar: ["sala02@flacso.edu.uy"],
      marcarFuera: [{ email: "sala03@flacso.edu.uy", reunionesFuturas: 2 }],
      sinLicencia: ["sala04@flacso.edu.uy", "nueva@flacso.edu.uy"],
      pierdenLicencia: ["sala04@flacso.edu.uy"]
    });
    expect(zoom.miembros).toHaveBeenCalledWith("tok", "g1");
    sinEscrituras(base);
    expect(base.cuentas).toEqual(original);
    expect(base.estado.config).toEqual(configAntes);
  });

  it("marca masiva la que dejaría sin reuniones nuevas a más de la mitad de las cuentas", async () => {
    const base = crearBase({
      cuentas: [
        cuentaZoom("z1", "sala01@flacso.edu.uy"),
        cuentaZoom("z2", "sala02@flacso.edu.uy"),
        cuentaZoom("z3", "sala03@flacso.edu.uy"),
        cuentaZoom("z4", "sala04@flacso.edu.uy")
      ]
    });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);

    const vista = await previsualizarSincronizacionConGrupo(base.db, descifrar, ahora);

    expect(vista).toMatchObject({
      ok: true,
      masivo: true,
      avisoMasivo: "Esta sincronización cambiaría muchas cuentas (3 de 4).",
      desactivar: ["sala02@flacso.edu.uy", "sala03@flacso.edu.uy", "sala04@flacso.edu.uy"]
    });
    sinEscrituras(base);
  });

  it("sin grupo, con el grupo vacío o con un error de Zoom avisa sin guardar nada", async () => {
    const sinGrupo = crearBase({ config: { grupoId: null, grupoNombre: null } });
    expect(await previsualizarSincronizacionConGrupo(sinGrupo.db, descifrar, ahora)).toEqual({
      ok: false,
      resumen: "Elegí un grupo de Zoom para obtener las cuentas anfitrionas.",
      ...vacia
    });
    sinEscrituras(sinGrupo);

    const vacio = crearBase({ cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    zoom.miembros.mockResolvedValueOnce([]);
    expect(await previsualizarSincronizacionConGrupo(vacio.db, descifrar, ahora)).toEqual({
      ok: false,
      resumen: "El grupo de Zoom no tiene miembros.",
      ...vacia
    });
    sinEscrituras(vacio);

    const sinPermiso = crearBase({ cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    zoom.miembros.mockRejectedValueOnce(new ZoomPermisosError());
    expect(await previsualizarSincronizacionConGrupo(sinPermiso.db, descifrar, ahora)).toEqual({
      ok: false,
      resumen: new ZoomPermisosError().message,
      ...vacia
    });
    sinEscrituras(sinPermiso);
    expect(sinPermiso.estado.config?.ultimaSincronizacionResultado).toBeNull();
  });

  it("un error inesperado de la base muestra un aviso legible", async () => {
    const base = crearBase({ cuentas: [cuentaZoom("z1", "sala01@flacso.edu.uy")] });
    zoom.miembros.mockResolvedValue([miembro("u1", "sala01@flacso.edu.uy")]);
    const falla = new Error("Invalid `prisma.cuentaProveedor.findMany()` invocation: connection reset");
    base.mock.cuentaProveedor.findMany.mockRejectedValueOnce(falla);
    const consola = vi.spyOn(console, "error").mockImplementation(() => {});

    expect(await previsualizarSincronizacionConGrupo(base.db, descifrar, ahora)).toEqual({
      ok: false,
      resumen: "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo más tarde.",
      ...vacia
    });
    expect(consola).toHaveBeenCalledWith(expect.any(String), falla);
    consola.mockRestore();
  });
});
