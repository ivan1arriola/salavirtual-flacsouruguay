import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import { crearOutboxFake } from "./support/aviso-migracion-zoom-fake";
import {
  aplicarMigracionZoom,
  type DependenciasMigracionZoom,
} from "../src/modules/reuniones/migracion-zoom-aplicar.service";

const ahora = new Date("2026-11-02T12:00:00Z");
const admin = { id: "admin", rol: "ADMINISTRACION" };
const MEET = "https://meet.google.com/abc-defg-hij";
const ZOOM = "https://us06web.zoom.us/j/123?pwd=xyz";

/** Base en memoria mínima con las operaciones que usa el servicio. */
function crearEscenario(
  over: {
    instancia?: Record<string, unknown>;
    zoomExistente?: Record<string, unknown> | null;
    encuentrosSerie?: number;
  } = {},
) {
  const instancia: Record<string, any> = {
    id: "i1",
    estado: "PROGRAMADA",
    inicioProgramadoAt: new Date("2026-11-10T12:00:00Z"),
    finProgramadoAt: new Date("2026-11-10T13:00:00Z"),
    proveedorActivoTipo: "GOOGLE_MEET",
    conservarGoogleMeet: false,
    solicitud: {
      titulo: "Clase 3",
      estado: "APROBADA",
      creadaPorUsuarioId: "creador",
      serieReunionId: "serie-1",
      docenteProgramaId: "dp-1",
      createdAt: new Date("2026-10-01T12:00:00Z"),
      docentePrograma: { docente: { usuarioId: "docente" }, programa: { nombre: "Maestría" } },
    },
    asignaciones: [],
    cohosts: [],
    cohostEmails: [],
    invitados: [{ email: "invitada@example.org", nombre: null }],
    ...over.instancia,
  };
  const outbox = crearOutboxFake([
    { id: "creador", nombres: "Carla", emailPrincipal: "carla@flacso.edu.uy" },
    { id: "docente", nombres: "Diego", emailPrincipal: "diego@flacso.edu.uy" },
  ]);
  const meet = {
    id: "ev-meet",
    externalEventId: "cal-1",
    joinUrl: MEET,
    estadoIntegracion: "SINCRONIZADA",
    operacionPendiente: null,
    cuentaProveedorId: "meet-host",
    cuentaProveedor: { emailOrganizador: "meet@flacso.edu.uy" },
    proveedor: { tipo: "GOOGLE_MEET" },
  };
  const eventos: Record<string, any>[] = [meet];
  if (over.zoomExistente) {
    eventos.push({
      id: "ev-zoom",
      externalEventId: null,
      joinUrl: null,
      estadoIntegracion: "PENDIENTE",
      operacionPendiente: "PROVISIONAR",
      cuentaProveedorId: "h1",
      cuentaProveedor: null,
      proveedor: { tipo: "ZOOM" },
      ...over.zoomExistente,
    });
  }
  const creaciones: unknown[] = [];
  const auditorias: any[] = [];
  const zoomCreado = { creados: 0 };

  const tx = {
    $executeRaw: vi.fn(async () => 1),
    instanciaSala: {
      findUnique: vi.fn(async () => ({ ...instancia, eventosProveedor: eventos })),
      count: vi.fn(async () => over.encuentrosSerie ?? 1),
      updateMany: vi.fn(async ({ where, data }: any) => {
        if (
          instancia["estado"] !== where.estado ||
          instancia["conservarGoogleMeet"] !== where.conservarGoogleMeet ||
          !where.OR.some(
            (condicion: any) => condicion.proveedorActivoTipo === instancia["proveedorActivoTipo"],
          )
        ) {
          return { count: 0 };
        }
        Object.assign(instancia, data);
        return { count: 1 };
      }),
    },
    cuentaProveedor: {
      findMany: vi.fn(async () => [{ id: "h1", prioridad: 1, limiteConcurrente: 1 }]),
    },
    eventoProveedor: {
      findMany: vi.fn(async () => []),
      findUnique: vi.fn(
        async ({ where }: any) => eventos.find((e) => e["id"] === where.id) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        creaciones.push(data);
        const ev = {
          id: "ev-zoom",
          externalEventId: null,
          joinUrl: null,
          estadoIntegracion: "PENDIENTE",
          operacionPendiente: "PROVISIONAR",
          cuentaProveedorId: data.cuentaProveedorId,
          cuentaProveedor: null,
          proveedor: { tipo: "ZOOM" },
        };
        eventos.push(ev);
        return { id: ev.id };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        Object.assign(
          eventos.find((e) => e["id"] === where.id)!,
          data,
        );
        return {};
      }),
    },
    usuario: outbox.usuario,
    avisoMigracionZoom: outbox.avisoMigracionZoom,
    proveedorReunion: { findUnique: vi.fn(async () => ({ id: "prov-zoom" })) },
    auditoria: {
      create: vi.fn(async ({ data }: any) => {
        auditorias.push(data);
        return {};
      }),
      findFirst: vi.fn(async () => (auditorias.length ? { id: "aud-1" } : null)),
    },
  };
  const db = { ...tx, $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };

  // Provisión Zoom simulada: persiste el ID externo una sola vez (idempotente).
  const sincronizarEventos = vi.fn(async (ids: readonly string[]) => {
    const ev = eventos.find((e) => e["id"] === ids[0])!;
    if (!ev["externalEventId"]) {
      ev["externalEventId"] = "999";
      zoomCreado.creados += 1;
    }
    Object.assign(ev, {
      joinUrl: ZOOM,
      estadoIntegracion: "SINCRONIZADA",
      operacionPendiente: null,
    });
    return [{ estado: "SINCRONIZADA" }];
  });

  let calendario: Record<string, any> = {
    description: `Clase\nUnirse: ${MEET}`,
    location: "Aula 3",
    conferenceData: { x: 1 },
    hangoutLink: MEET,
  };
  const actualizar = vi.fn(async ({ cambio }: any) => {
    const { conferenceData, ...resto } = cambio;
    calendario = { ...calendario, ...resto };
    if (conferenceData === null) {
      delete calendario["conferenceData"];
      delete calendario["hangoutLink"];
    }
  });
  const deps: DependenciasMigracionZoom = {
    db: db as unknown as PrismaClient,
    sincronizarEventos,
    verificarReunionZoom: vi.fn(async () => ({ joinUrl: ZOOM })),
    calendar: { obtener: vi.fn(async () => ({ ...calendario })), actualizar },
    ahora: () => ahora,
  };
  return {
    deps,
    outbox,
    instancia,
    eventos,
    creaciones,
    auditorias,
    sincronizarEventos,
    actualizar,
    zoomCreado,
    db,
    setActualizar: (fn: any) => {
      actualizar.mockImplementation(fn);
    },
  };
}

describe("aplicarMigracionZoom", () => {
  it("rechaza a quien no es Administración sin tocar la base", async () => {
    const e = crearEscenario();
    await expect(
      aplicarMigracionZoom(
        e.deps,
        { id: "d", rol: "DOCENTE" },
        { modo: "PILOTO", instanciaIds: ["i1"] },
      ),
    ).rejects.toMatchObject({ status: 403 });
    expect(e.db.$transaction).not.toHaveBeenCalled();
  });

  it("limita el piloto a un encuentro y el lote a su máximo", async () => {
    const e = crearEscenario();
    await expect(
      aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["a", "b"] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      aplicarMigracionZoom(e.deps, admin, {
        modo: "LOTE",
        instanciaIds: Array.from({ length: 11 }, (_, i) => `i${i}`),
      }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      aplicarMigracionZoom(e.deps, admin, { modo: "LOTE", instanciaIds: [] }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("omite un encuentro de una serie con varios encuentros futuros sin crear Zoom ni tocar Calendar", async () => {
    const e = crearEscenario({ encuentrosSerie: 3 });
    const [r] = await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(r).toMatchObject({ resultado: "OMITIDA", etapa: "VALIDACION", reintentable: false });
    expect(r.mensaje).toContain("serie");
    expect(e.creaciones).toHaveLength(0);
    expect(e.sincronizarEventos).not.toHaveBeenCalled();
    expect(e.actualizar).not.toHaveBeenCalled();
    expect(e.instancia["proveedorActivoTipo"]).toBe("GOOGLE_MEET");
  });

  it("consulta los encuentros futuros de la serie con el filtro de serie de la solicitud", async () => {
    const e = crearEscenario();
    await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    const consulta = (
      e.db.instanciaSala.count as unknown as { mock: { calls: [{ where: any }][] } }
    ).mock.calls[0][0].where;
    expect(consulta).toMatchObject({
      estado: "PROGRAMADA",
      solicitud: { serieReunionId: "serie-1" },
    });
  });

  it("migra: Zoom con ID persistido, Calendar sin Meet con ubicación física, luego proveedor activo y Meet intacto", async () => {
    const e = crearEscenario();
    const [r] = await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });

    expect(r).toMatchObject({ resultado: "MIGRADA", reintentable: false });
    expect(e.creaciones).toEqual([
      expect.objectContaining({
        proveedorId: "prov-zoom",
        cuentaProveedorId: "h1",
        operacionPendiente: "PROVISIONAR",
      }),
    ]);
    expect(e.actualizar).toHaveBeenCalledTimes(1);
    const cambio = e.actualizar.mock.calls[0][0].cambio;
    expect(cambio).toMatchObject({ conferenceData: null });
    expect(cambio.description).toContain(ZOOM);
    expect(cambio.description).not.toContain(MEET);
    expect(cambio).not.toHaveProperty("location"); // la ubicación física no se pierde
    expect(e.instancia["proveedorActivoTipo"]).toBe("ZOOM");
    expect(e.auditorias).toEqual([
      expect.objectContaining({ accion: "MIGRACION_ZOOM_APLICADA", entidadId: "i1" }),
    ]);
    // El evento Meet se conserva: sin updates ni borrado sobre su fila.
    expect(e.eventos.find((x) => x["id"] === "ev-meet")).toMatchObject({
      joinUrl: MEET,
      estadoIntegracion: "SINCRONIZADA",
    });
  });

  it("es idempotente: aplicar de nuevo no crea otra reunión Zoom ni vuelve a parchar", async () => {
    const e = crearEscenario();
    await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    const [segunda] = await aplicarMigracionZoom(e.deps, admin, {
      modo: "PILOTO",
      instanciaIds: ["i1"],
    });

    expect(segunda).toMatchObject({ resultado: "YA_ZOOM" });
    expect(e.zoomCreado.creados).toBe(1);
    expect(e.creaciones).toHaveLength(1);
    expect(e.actualizar).toHaveBeenCalledTimes(1);
  });

  it("cambia a Zoom también si el proveedor activo antiguo era NULL", async () => {
    const e = crearEscenario({ instancia: { proveedorActivoTipo: null } });
    const [r] = await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(r.resultado).toBe("MIGRADA");
    expect(e.instancia["proveedorActivoTipo"]).toBe("ZOOM");
  });

  it("reporta error si el cambio final de proveedor no afecta una fila", async () => {
    const e = crearEscenario();
    e.db.instanciaSala.updateMany.mockResolvedValue({ count: 0 });
    const [r] = await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(r).toMatchObject({ resultado: "ERROR", etapa: "CAMBIO_PROVEEDOR", reintentable: true });
    expect(e.auditorias).toHaveLength(0);
  });

  it("si Calendar falla deja Meet activo, es reintentable y el reintento reutiliza la reunión Zoom", async () => {
    const e = crearEscenario();
    e.setActualizar(async () => {
      throw new Error("Calendar 503");
    });
    const [fallo] = await aplicarMigracionZoom(e.deps, admin, {
      modo: "PILOTO",
      instanciaIds: ["i1"],
    });

    expect(fallo).toMatchObject({
      resultado: "ERROR",
      etapa: "CALENDAR",
      reintentable: true,
      mensaje: "Calendar 503",
    });
    expect(e.instancia["proveedorActivoTipo"]).toBe("GOOGLE_MEET");
    expect(e.auditorias).toHaveLength(0);

    e.setActualizar(async ({ cambio }: any) => {
      void cambio;
    });
    // Reintento con Calendar sano: ahora aplica el cambio real.
    const sano = crearEscenarioReintento(e);
    const [ok] = await aplicarMigracionZoom(sano, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(ok).toMatchObject({ resultado: "MIGRADA" });
    expect(e.zoomCreado.creados).toBe(1);
    expect(e.creaciones).toHaveLength(1);
    expect(e.instancia["proveedorActivoTipo"]).toBe("ZOOM");
  });

  it("no cambia el proveedor si el GET de verificación sigue mostrando Meet", async () => {
    const e = crearEscenario();
    const deps = {
      ...e.deps,
      calendar: {
        ...e.deps.calendar,
        obtener: vi.fn(async () => ({ description: `Unirse: ${MEET}`, conferenceData: { x: 1 } })),
      },
    };
    const [r] = await aplicarMigracionZoom(deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(r).toMatchObject({ resultado: "ERROR", etapa: "CALENDAR" });
    expect(e.instancia["proveedorActivoTipo"]).toBe("GOOGLE_MEET");
  });

  it("si Zoom no queda sincronizado no toca Calendar ni el proveedor", async () => {
    const e = crearEscenario();
    e.sincronizarEventos.mockImplementation(async () => [{ estado: "ERROR", error: "Zoom caído" }]);
    const [r] = await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(r).toMatchObject({ resultado: "ERROR", etapa: "ZOOM", reintentable: true });
    expect(e.actualizar).not.toHaveBeenCalled();
    expect(e.instancia["proveedorActivoTipo"]).toBe("GOOGLE_MEET");
  });

  it("rechaza un enlace que no es de Zoom devuelto por la verificación", async () => {
    const e = crearEscenario();
    const deps = {
      ...e.deps,
      verificarReunionZoom: vi.fn(async () => ({ joinUrl: "https://evil.example/j/1" })),
    };
    const [r] = await aplicarMigracionZoom(deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(r).toMatchObject({ resultado: "ERROR", etapa: "ZOOM", reintentable: false });
    expect(e.actualizar).not.toHaveBeenCalled();
  });

  it.each([
    ["excepción marcada", { conservarGoogleMeet: true }],
    [
      "comienza dentro del margen",
      {
        inicioProgramadoAt: new Date("2026-11-02T20:00:00Z"),
        finProgramadoAt: new Date("2026-11-02T21:00:00Z"),
      },
    ],
    ["ya no está programado", { estado: "CANCELADA" }],
  ])("revalida y omite si %s, sin crear Zoom ni parchar", async (_n, instancia) => {
    const e = crearEscenario({ instancia: instancia });
    const [r] = await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect(r).toMatchObject({ resultado: "OMITIDA", etapa: "VALIDACION", reintentable: false });
    expect(e.creaciones).toHaveLength(0);
    expect(e.sincronizarEventos).not.toHaveBeenCalled();
    expect(e.actualizar).not.toHaveBeenCalled();
  });

  it("toma el bloqueo advisory de la instancia antes de revalidar", async () => {
    const e = crearEscenario();
    await aplicarMigracionZoom(e.deps, admin, { modo: "PILOTO", instanciaIds: ["i1"] });
    expect((e.db as any).$executeRaw).toHaveBeenCalled();
  });

  describe("avisos por correo", () => {
    const destinatarios = (fn: ReturnType<typeof vi.fn>) =>
      fn.mock.calls.map(([m]: any) => m.to[0]).sort();

    it("envía los avisos con el enlace Zoom real solo después de cambiar el proveedor", async () => {
      const e = crearEscenario();
      const proveedorAlEnviar: unknown[] = [];
      const enviarCorreo = vi.fn(async (m: any) => {
        proveedorAlEnviar.push(e.instancia["proveedorActivoTipo"]);
        expect(m.text).toContain(ZOOM);
        return { sent: true };
      });
      const [r] = await aplicarMigracionZoom({ ...e.deps, enviarCorreo }, admin, {
        modo: "PILOTO",
        instanciaIds: ["i1"],
      });

      expect(proveedorAlEnviar).toEqual(["ZOOM", "ZOOM", "ZOOM"]);
      expect(destinatarios(enviarCorreo)).toEqual([
        "carla@flacso.edu.uy",
        "diego@flacso.edu.uy",
        "invitada@example.org",
      ]);
      expect(r).toMatchObject({
        resultado: "MIGRADA",
        reintentable: false,
        avisos: { estado: "COMPLETO", enviados: 3, errores: 0 },
      });
    });

    it("no envía avisos si Calendar falla (Meet sigue activo)", async () => {
      const e = crearEscenario();
      e.setActualizar(async () => {
        throw new Error("Calendar 503");
      });
      const enviarCorreo = vi.fn(async () => ({ sent: true }));
      const [r] = await aplicarMigracionZoom({ ...e.deps, enviarCorreo }, admin, {
        modo: "PILOTO",
        instanciaIds: ["i1"],
      });
      expect(r).toMatchObject({ resultado: "ERROR", etapa: "CALENDAR" });
      expect(r.avisos).toBeUndefined();
      expect(enviarCorreo).not.toHaveBeenCalled();
      expect(e.outbox.filas).toHaveLength(0);
    });

    it("un fallo de correo no revierte la migración, se informa y reaplicar reenvía solo los fallidos", async () => {
      const e = crearEscenario();
      const falla = vi.fn(async ({ to }: any) =>
        to[0] === "diego@flacso.edu.uy" ? { sent: false, error: "SES_DOWN" } : { sent: true },
      );
      const [primera] = await aplicarMigracionZoom({ ...e.deps, enviarCorreo: falla }, admin, {
        modo: "PILOTO",
        instanciaIds: ["i1"],
      });
      expect(primera).toMatchObject({
        resultado: "MIGRADA",
        reintentable: true,
        avisos: { estado: "PARCIAL", enviados: 2, errores: 1 },
      });
      expect(e.instancia["proveedorActivoTipo"]).toBe("ZOOM");

      const sano = vi.fn(async () => ({ sent: true }));
      const [segunda] = await aplicarMigracionZoom({ ...e.deps, enviarCorreo: sano }, admin, {
        modo: "PILOTO",
        instanciaIds: ["i1"],
      });
      expect(destinatarios(sano)).toEqual(["diego@flacso.edu.uy"]);
      expect(segunda).toMatchObject({
        resultado: "YA_ZOOM",
        reintentable: false,
        avisos: { estado: "COMPLETO", enviados: 1, yaEnviados: 2 },
      });
      expect(e.zoomCreado.creados).toBe(1);

      const tercera = vi.fn(async () => ({ sent: true }));
      await aplicarMigracionZoom({ ...e.deps, enviarCorreo: tercera }, admin, {
        modo: "PILOTO",
        instanciaIds: ["i1"],
      });
      expect(tercera).not.toHaveBeenCalled();
    });

    it("un encuentro que ya era Zoom sin migración previa no recibe avisos", async () => {
      const e = crearEscenario({
        instancia: { proveedorActivoTipo: "ZOOM" },
        zoomExistente: {
          joinUrl: ZOOM,
          externalEventId: "999",
          estadoIntegracion: "SINCRONIZADA",
          operacionPendiente: null,
        },
      });
      const enviarCorreo = vi.fn(async () => ({ sent: true }));
      const [r] = await aplicarMigracionZoom({ ...e.deps, enviarCorreo }, admin, {
        modo: "PILOTO",
        instanciaIds: ["i1"],
      });
      expect(r).toMatchObject({ resultado: "YA_ZOOM" });
      expect(r.avisos).toBeUndefined();
      expect(enviarCorreo).not.toHaveBeenCalled();
    });
  });

  it("el lote procesa cada encuentro por separado, deduplica ids y un fallo no frena a los demás", async () => {
    const e = crearEscenario();
    const original = e.db.instanciaSala.findUnique;
    e.db.instanciaSala.findUnique = vi.fn(async (args: any) =>
      args.where.id === "nope" ? null : original(),
    ) as any;
    const res = await aplicarMigracionZoom(e.deps, admin, {
      modo: "LOTE",
      instanciaIds: ["nope", "i1", "i1"],
    });
    expect(res.map((r) => [r.instanciaId, r.resultado])).toEqual([
      ["nope", "OMITIDA"],
      ["i1", "MIGRADA"],
    ]);
  });
});

/** Reutiliza el mismo estado en memoria con un Calendar que sí acepta el cambio. */
function crearEscenarioReintento(e: ReturnType<typeof crearEscenario>): DependenciasMigracionZoom {
  let calendario: Record<string, any> = {
    description: `Clase\nUnirse: ${MEET}`,
    location: "Aula 3",
    conferenceData: { x: 1 },
  };
  return {
    ...e.deps,
    calendar: {
      obtener: vi.fn(async () => ({ ...calendario })),
      actualizar: vi.fn(async ({ cambio }: any) => {
        const { conferenceData, ...resto } = cambio;
        calendario = { ...calendario, ...resto };
        if (conferenceData === null) {
          delete calendario["conferenceData"];
        }
      }),
    },
  };
}
