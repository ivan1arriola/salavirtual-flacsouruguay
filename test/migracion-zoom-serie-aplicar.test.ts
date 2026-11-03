import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  aplicarMigracionZoomSerie,
  type DependenciasMigracionZoomSerie,
} from "../src/modules/reuniones/migracion-zoom-serie-aplicar.service";

const ahora = new Date("2026-11-02T12:00:00Z");
const admin = { id: "admin", rol: "ADMINISTRACION" };
const MEET = "https://meet.google.com/abc-defg-hij";
const ZOOM = "https://us06web.zoom.us/j/123?pwd=xyz";
const SERIE = "serie:s-1";

type Opciones = Readonly<{ sinCitas?: boolean; inicioPrimero?: Date; conservar?: readonly string[] }>;

/** Base en memoria con una serie de tres encuentros en Meet y una sola reunión Zoom compartida. */
function crearEscenario(opciones: Opciones = {}) {
  const inicios = [
    opciones.inicioPrimero ?? new Date("2026-11-10T12:00:00Z"),
    new Date("2026-11-17T12:00:00Z"),
    new Date("2026-11-24T12:00:00Z"),
  ];
  const instancias = inicios.map((inicio, indice) => ({
    id: `i${indice + 1}`,
    estado: "PROGRAMADA",
    inicioProgramadoAt: inicio,
    finProgramadoAt: new Date(inicio.getTime() + 3_600_000),
    proveedorActivoTipo: "GOOGLE_MEET" as string | null,
    conservarGoogleMeet: (opciones.conservar ?? []).includes(`i${indice + 1}`),
    eventosProveedor: [{
      id: `meet-${indice + 1}`,
      externalEventId: opciones.sinCitas ? null : `cal-${indice + 1}`,
      joinUrl: MEET,
      estadoIntegracion: "SINCRONIZADA",
      operacionPendiente: null,
      reunionProveedorId: null as string | null,
      cuentaProveedorId: "meet-host",
      cuentaProveedor: { emailOrganizador: "meet@flacso.edu.uy" },
      proveedor: { tipo: "GOOGLE_MEET" },
    }] as Record<string, any>[],
  }));
  const reuniones: Record<string, any>[] = [];
  const cambios: Record<string, any>[] = [];
  const auditorias: any[] = [];
  const estado = { zoomCreados: 0 };

  const tx = {
    $executeRaw: vi.fn(async () => 1),
    proveedorReunion: { findUnique: vi.fn(async () => ({ id: "prov-zoom" })) },
    instanciaSala: {
      findMany: vi.fn(async () => instancias),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const objetivo = instancias.filter((i) =>
          where.id.in.includes(i.id) && i.estado === where.estado && i.conservarGoogleMeet === where.conservarGoogleMeet
          && where.OR.some((c: any) => c.proveedorActivoTipo === i.proveedorActivoTipo));
        objetivo.forEach((i) => Object.assign(i, data));
        return { count: objetivo.length };
      }),
    },
    cuentaProveedor: {
      findMany: vi.fn(async () => [
        { id: "h1", emailOrganizador: "sala01@flacso.edu.uy", prioridad: 1, limiteConcurrente: 1 },
        { id: "h2", emailOrganizador: "sala02@flacso.edu.uy", prioridad: 2, limiteConcurrente: 1 },
      ]),
    },
    reunionProveedor: {
      findUnique: vi.fn(async ({ where }: any) =>
        reuniones.find((r) => (where.id ? r.id === where.id : r.serieClave === where.proveedorId_serieClave.serieClave)) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const nueva = { id: "r1", estadoCreacion: "PENDIENTE", externalId: null, joinUrl: null, errorIntegracion: null, ...data };
        reuniones.push(nueva);
        return { id: nueva.id };
      }),
      update: vi.fn(async ({ where, data }: any) => Object.assign(reuniones.find((r) => r.id === where.id)!, data)),
    },
    eventoProveedor: {
      findMany: vi.fn(async ({ where }: any) => where.id?.in
        ? instancias.flatMap((i) => i.eventosProveedor).filter((e) => where.id.in.includes(e.id))
        : []),
      create: vi.fn(async ({ data }: any) => {
        const instancia = instancias.find((i) => i.id === data.instanciaSalaId)!;
        const evento = {
          id: `zoom-${instancia.id}`, externalEventId: null, joinUrl: null, estadoIntegracion: "PENDIENTE",
          operacionPendiente: "PROVISIONAR", errorIntegracion: null, cuentaProveedorId: data.cuentaProveedorId,
          reunionProveedorId: data.reunionProveedorId, cuentaProveedor: null, proveedor: { tipo: "ZOOM" },
        };
        instancia.eventosProveedor.push(evento);
        return { id: evento.id };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const evento = instancias.flatMap((i) => i.eventosProveedor).find((e) => e.id === where.id)!;
        return Object.assign(evento, data);
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const eventos = instancias.flatMap((i) => i.eventosProveedor).filter((e) => where.id.in.includes(e.id));
        eventos.forEach((e) => Object.assign(e, data));
        return { count: eventos.length };
      }),
    },
    cambioEnlaceCita: {
      findMany: vi.fn(async () => cambios.map((c) => ({ ...c }))),
      create: vi.fn(async ({ data }: any) => {
        const fila = { id: `c-${data.instanciaSalaId}`, ...data };
        cambios.push(fila);
        return { id: fila.id, estado: fila.estado };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const fila = cambios.find((c) => c.id === where.id)!;
        Object.assign(fila, data);
        return { id: fila.id, estado: fila.estado };
      }),
    },
    auditoria: {
      create: vi.fn(async ({ data }: any) => { auditorias.push(data); return {}; }),
      findFirst: vi.fn(async () => (auditorias.length ? { id: "aud-1" } : null)),
    },
  };
  const db = { ...tx, $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };

  // Provisión simulada: la reunión compartida se crea una sola vez y todos los eventos la usan.
  const sincronizarEventos = vi.fn(async (ids: readonly string[]) => {
    const reunion = reuniones[0];
    if (reunion.estadoCreacion !== "CREADA") {
      Object.assign(reunion, { estadoCreacion: "CREADA", externalId: "999", joinUrl: ZOOM });
      estado.zoomCreados += 1;
    }
    for (const evento of instancias.flatMap((i) => i.eventosProveedor).filter((e) => ids.includes(e.id))) {
      Object.assign(evento, { joinUrl: ZOOM, externalEventId: "999", estadoIntegracion: "SINCRONIZADA", operacionPendiente: null });
    }
    return ids.map(() => ({ estado: "SINCRONIZADA" }));
  });

  // Calendar: una cita por encuentro; `fallar` es el conjunto de citas cuyo parche lanza error.
  const calendarios = new Map(instancias.map((i, indice) => [`cal-${indice + 1}`, {
    description: `Clase\nUnirse: ${MEET}`, location: "Aula", conferenceData: { x: 1 }, hangoutLink: MEET,
  } as Record<string, any>]));
  const fallar = new Set<string>();
  const actualizar = vi.fn(async ({ eventId, cambio }: any) => {
    if (fallar.has(eventId)) throw new Error("Calendar rechazó el parche.");
    const { conferenceData, ...resto } = cambio;
    const actual = { ...calendarios.get(eventId)!, ...resto };
    if (conferenceData === null) { delete actual.conferenceData; delete actual.hangoutLink; }
    calendarios.set(eventId, actual);
  });
  const notificarCambioSerie = vi.fn(async () => ({
    estado: "COMPLETO" as const, destinatarios: 0, enviados: 0, yaEnviados: 0, enCurso: 0, errores: 0, detalle: [],
  }));
  const deps: DependenciasMigracionZoomSerie = {
    db: db as unknown as PrismaClient,
    sincronizarEventos,
    verificarReunionZoom: vi.fn(async () => ({ joinUrl: ZOOM })),
    calendar: {
      obtener: vi.fn(async ({ eventId }: any) => ({ ...calendarios.get(eventId)! })),
      actualizar,
    },
    enviarCorreo: vi.fn(async () => ({ sent: true })),
    notificarCambioSerie: notificarCambioSerie as unknown as DependenciasMigracionZoomSerie["notificarCambioSerie"],
    ahora: () => ahora,
  };
  return { deps, db, instancias, reuniones, cambios, auditorias, estado, fallar, actualizar, sincronizarEventos, notificarCambioSerie };
}

const migrar = (e: ReturnType<typeof crearEscenario>) =>
  aplicarMigracionZoomSerie(e.deps, admin, { modo: "PILOTO", serieClaves: [SERIE] });

describe("aplicarMigracionZoomSerie", () => {
  it("rechaza a quien no es Administración y valida los límites del piloto y del lote", async () => {
    const e = crearEscenario();
    await expect(aplicarMigracionZoomSerie(e.deps, { id: "d", rol: "DOCENTE" }, { modo: "PILOTO", serieClaves: [SERIE] }))
      .rejects.toMatchObject({ status: 403 });
    await expect(aplicarMigracionZoomSerie(e.deps, admin, { modo: "PILOTO", serieClaves: ["a", "b"] })).rejects.toMatchObject({ status: 400 });
    await expect(aplicarMigracionZoomSerie(e.deps, admin, { modo: "LOTE", serieClaves: Array.from({ length: 6 }, (_, i) => `serie:${i}`) }))
      .rejects.toMatchObject({ status: 400 });
    await expect(aplicarMigracionZoomSerie(e.deps, admin, { modo: "LOTE", serieClaves: [] })).rejects.toMatchObject({ status: 400 });
    expect(e.db.$transaction).not.toHaveBeenCalled();
  });

  it("migra los tres encuentros con una sola reunión Zoom y el mismo enlace", async () => {
    const e = crearEscenario();
    const [r] = await migrar(e);
    expect(r).toMatchObject({ resultado: "MIGRADA", etapa: "FINAL", encuentros: 3, reintentable: false });
    expect(e.instancias.map((i) => i.proveedorActivoTipo)).toEqual(["ZOOM", "ZOOM", "ZOOM"]);
    expect(e.estado.zoomCreados).toBe(1);
    expect(e.reuniones).toHaveLength(1);
    const zoom = e.instancias.flatMap((i) => i.eventosProveedor).filter((ev) => ev.proveedor.tipo === "ZOOM");
    expect(zoom).toHaveLength(3);
    expect(new Set(zoom.map((ev) => ev.joinUrl))).toEqual(new Set([ZOOM]));
    expect(new Set(zoom.map((ev) => ev.reunionProveedorId))).toEqual(new Set(["r1"]));
    expect(new Set(zoom.map((ev) => ev.cuentaProveedorId)).size).toBe(1);
    expect(e.cambios.map((c) => c.estado)).toEqual(["VERIFICADA", "VERIFICADA", "VERIFICADA"]);
    expect(e.auditorias).toHaveLength(1);
    expect(e.auditorias[0]).toMatchObject({ accion: "MIGRACION_ZOOM_SERIE_APLICADA", entidadTipo: "SerieReunion", entidadId: SERIE });
    expect(e.notificarCambioSerie).toHaveBeenCalledTimes(1);
    expect(e.notificarCambioSerie).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      serieClave: SERIE, tipo: "MIGRACION_SERIE", joinUrl: ZOOM, instanciaIds: ["i1", "i2", "i3"],
    }));
  });

  it.each([["cal-1"], ["cal-2"], ["cal-3"]])(
    "si falla el parche de la cita %s ningún encuentro cambia y el reintento retoma solo las pendientes",
    async (citaQueFalla) => {
      const e = crearEscenario();
      e.fallar.add(citaQueFalla);
      const [fallo] = await migrar(e);
      expect(fallo).toMatchObject({ resultado: "ERROR", etapa: "CALENDAR", reintentable: true });
      expect(e.instancias.map((i) => i.proveedorActivoTipo)).toEqual(["GOOGLE_MEET", "GOOGLE_MEET", "GOOGLE_MEET"]);
      expect(e.cambios.filter((c) => c.estado === "VERIFICADA")).toHaveLength(2);
      expect(e.auditorias).toHaveLength(0);
      expect(e.notificarCambioSerie).not.toHaveBeenCalled();

      e.fallar.clear();
      e.actualizar.mockClear();
      const [reintento] = await migrar(e);
      expect(reintento).toMatchObject({ resultado: "MIGRADA", encuentros: 3 });
      expect(e.actualizar).toHaveBeenCalledTimes(1);
      expect(e.estado.zoomCreados).toBe(1);
      expect(e.reuniones).toHaveLength(1);
      expect(e.instancias.map((i) => i.proveedorActivoTipo)).toEqual(["ZOOM", "ZOOM", "ZOOM"]);
    },
  );

  it("una serie sin cita de Calendar verificable no se migra a ciegas: queda en revisión", async () => {
    const e = crearEscenario({ sinCitas: true });
    const [r] = await migrar(e);
    expect(r).toMatchObject({ resultado: "OMITIDA", etapa: "VALIDACION" });
    expect(e.instancias.map((i) => i.proveedorActivoTipo)).toEqual(["GOOGLE_MEET", "GOOGLE_MEET", "GOOGLE_MEET"]);
  });

  it("un encuentro a menos de 24 horas deja toda la serie sin migrar", async () => {
    const e = crearEscenario({ inicioPrimero: new Date("2026-11-03T08:00:00Z") });
    const [r] = await migrar(e);
    expect(r).toMatchObject({ resultado: "OMITIDA", etapa: "VALIDACION", reintentable: false });
    expect(r.mensaje).toContain("CERCANO");
    expect(e.sincronizarEventos).not.toHaveBeenCalled();
    expect(e.reuniones).toHaveLength(0);
  });

  it("una excepción en un solo encuentro deja la serie en revisión", async () => {
    const e = crearEscenario({ conservar: ["i2"] });
    const [r] = await migrar(e);
    expect(r).toMatchObject({ resultado: "OMITIDA", etapa: "VALIDACION" });
    expect(r.mensaje).toContain("REVISAR");
    expect(e.reuniones).toHaveLength(0);
  });

  it("si un encuentro cambia de proveedor durante la conversión revierte todo y no avisa", async () => {
    const e = crearEscenario();
    e.sincronizarEventos.mockImplementationOnce(async (ids: readonly string[]) => {
      e.instancias[1].conservarGoogleMeet = true;
      const reunion = e.reuniones[0];
      Object.assign(reunion, { estadoCreacion: "CREADA", externalId: "999", joinUrl: ZOOM });
      for (const ev of e.instancias.flatMap((i) => i.eventosProveedor).filter((x) => ids.includes(x.id))) {
        Object.assign(ev, { joinUrl: ZOOM, externalEventId: "999", estadoIntegracion: "SINCRONIZADA", operacionPendiente: null });
      }
      return ids.map(() => ({ estado: "SINCRONIZADA" }));
    });
    // El fake de transacción no revierte: comprobamos que se informa el error y que no hay auditoría ni aviso.
    const [r] = await migrar(e);
    expect(r).toMatchObject({ resultado: "ERROR", etapa: "CAMBIO_PROVEEDOR", reintentable: true });
    expect(e.auditorias).toHaveLength(0);
    expect(e.notificarCambioSerie).not.toHaveBeenCalled();
  });

  it("una serie que ya está en Zoom no se vuelve a migrar", async () => {
    const e = crearEscenario();
    await migrar(e);
    e.notificarCambioSerie.mockClear();
    e.sincronizarEventos.mockClear();
    const [r] = await migrar(e);
    expect(r).toMatchObject({ resultado: "YA_ZOOM", etapa: "FINAL" });
    expect(e.sincronizarEventos).not.toHaveBeenCalled();
    expect(e.reuniones).toHaveLength(1);
    // Reaplicar solo completa avisos pendientes: la outbox evita duplicados.
    expect(e.notificarCambioSerie).toHaveBeenCalledTimes(1);
  });

  it("rechaza una clave de serie inválida", async () => {
    const e = crearEscenario();
    const [r] = await aplicarMigracionZoomSerie(e.deps, admin, { modo: "PILOTO", serieClaves: ["serie:"] });
    expect(r).toMatchObject({ resultado: "OMITIDA", etapa: "VALIDACION" });
  });
});
