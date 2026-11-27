import { describe, expect, it, vi } from "vitest";
import type { PrismaClient } from "@prisma/client";
import {
  corregirSerieEnlaces,
  corregirSeriesEnlaces,
  limpiarReunionesAntiguas,
  type DependenciasCorreccionSerie,
} from "../src/modules/reuniones/corregir-serie-enlaces.service";

const ahora = new Date("2026-11-03T12:00:00Z");
const admin = { id: "admin", rol: "ADMINISTRACION" };
const NUEVO = "https://us06web.zoom.us/j/999?pwd=nuevo";
const SERIE = "serie:s-1";
const viejo = (n: number) => `https://us06web.zoom.us/j/${n}00?pwd=v${n}`;

type Opciones = Readonly<{
  sinCitas?: boolean;
  mixta?: boolean;
  unificada?: boolean;
  ocupaH1?: boolean;
  inicioPrimero?: Date;
}>;

/** Base en memoria: una serie de tres encuentros en Zoom, cada uno con su propia reunión y cuentas distintas. */
function crearEscenario(opciones: Opciones = {}) {
  const inicios = [
    opciones.inicioPrimero ?? new Date("2026-11-10T12:00:00Z"),
    new Date("2026-11-17T12:00:00Z"),
    new Date("2026-11-24T12:00:00Z"),
  ];
  const instancias = inicios.map((inicio, indice) => {
    const n = indice + 1;
    const compartida = opciones.unificada;
    return {
      id: `i${n}`,
      estado: "PROGRAMADA",
      inicioProgramadoAt: inicio,
      finProgramadoAt: new Date(inicio.getTime() + 3_600_000),
      proveedorActivoTipo: opciones.mixta && n === 3 ? "GOOGLE_MEET" : "ZOOM",
      solicitud: { titulo: "Seminario" },
      eventosProveedor: [
        {
          id: `zoom-${n}`,
          externalEventId: compartida ? "999" : `${n}00`,
          joinUrl: compartida ? NUEVO : viejo(n),
          estadoIntegracion: "SINCRONIZADA",
          operacionPendiente: null as string | null,
          reunionProveedorId: compartida ? "r1" : (null as string | null),
          cuentaProveedorId: n === 2 ? "h2" : "h1",
          cuentaProveedor: {
            emailOrganizador: n === 2 ? "sala02@flacso.edu.uy" : "sala01@flacso.edu.uy",
          },
          proveedor: { tipo: "ZOOM" },
        },
        ...(opciones.sinCitas
          ? []
          : [
              {
                id: `meet-${n}`,
                externalEventId: `cal-${n}`,
                joinUrl: null,
                estadoIntegracion: "SINCRONIZADA",
                operacionPendiente: null,
                reunionProveedorId: null,
                cuentaProveedorId: "meet-host",
                cuentaProveedor: { emailOrganizador: "meet@flacso.edu.uy" },
                proveedor: { tipo: "GOOGLE_MEET" },
              },
            ]),
      ] as Record<string, any>[],
    };
  });
  const reuniones: Record<string, any>[] = opciones.unificada
    ? [
        {
          id: "r1",
          cuentaProveedorId: "h1",
          externalId: "999",
          joinUrl: NUEVO,
          estadoCreacion: "CREADA",
          reclamoAt: null,
          reclamoToken: null,
        },
      ]
    : [];
  const cambios: Record<string, any>[] = [];
  const auditorias: any[] = [];
  const zoomCreados = { n: 0 };

  const tx = {
    $executeRaw: vi.fn(async () => 1),
    proveedorReunion: { findUnique: vi.fn(async () => ({ id: "prov-zoom" })) },
    instanciaSala: { findMany: vi.fn(async () => instancias) },
    cuentaProveedor: {
      findMany: vi.fn(async () => [
        { id: "h1", emailOrganizador: "sala01@flacso.edu.uy", prioridad: 1, limiteConcurrente: 1 },
        { id: "h2", emailOrganizador: "sala02@flacso.edu.uy", prioridad: 2, limiteConcurrente: 1 },
      ]),
    },
    reunionProveedor: {
      findUnique: vi.fn(
        async ({ where }: any) =>
          reuniones.find((r) =>
            where.id
              ? r["id"] === where.id
              : r["serieClave"] === undefined ||
                r["serieClave"] === where.proveedorId_serieClave.serieClave,
          ) ?? null,
      ),
      create: vi.fn(async ({ data }: any) => {
        const nueva = {
          id: "r1",
          estadoCreacion: "PENDIENTE",
          externalId: null,
          joinUrl: null,
          reclamoAt: null,
          reclamoToken: null,
          ...data,
        };
        reuniones.push(nueva);
        return { id: nueva.id };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const reunion = reuniones.find((r) => r["id"] === where.id);
        if (!reunion) {
          return { count: 0 };
        }
        if (where.estadoCreacion === "CREANDO" && reunion["estadoCreacion"] !== "CREANDO") {
          return { count: 0 };
        }
        if (where.reclamoToken && reunion["reclamoToken"] !== where.reclamoToken) {
          return { count: 0 };
        }
        if (
          where.OR &&
          !["PENDIENTE", "ELIMINADA"].includes(reunion["estadoCreacion"]) &&
          !(
            reunion["estadoCreacion"] === "CREANDO" &&
            reunion["reclamoAt"] < where.OR[1].reclamoAt.lt
          ) &&
          !(reunion["estadoCreacion"] === "CREADA" && !reunion["externalId"])
        ) {
          return { count: 0 };
        }
        Object.assign(reunion, data);
        return { count: 1 };
      }),
      findMany: vi.fn(async () => []),
    },
    eventoProveedor: {
      findMany: vi.fn(async () =>
        opciones.ocupaH1
          ? [
              {
                cuentaProveedorId: "h1",
                instancia: {
                  inicioProgramadoAt: inicios[1],
                  finProgramadoAt: new Date(inicios[1].getTime() + 3_600_000),
                },
              },
              {
                cuentaProveedorId: "h2",
                instancia: {
                  inicioProgramadoAt: inicios[1],
                  finProgramadoAt: new Date(inicios[1].getTime() + 3_600_000),
                },
              },
            ]
          : [],
      ),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const eventos = instancias
          .flatMap((i) => i.eventosProveedor)
          .filter(
            (e) =>
              where.id.in.includes(e["id"]) && e["operacionPendiente"] === where.operacionPendiente,
          );
        eventos.forEach((e) => Object.assign(e, data));
        return { count: eventos.length };
      }),
      count: vi.fn(
        async ({ where }: any) =>
          instancias
            .flatMap((i) => i.eventosProveedor)
            .filter((e) => e["externalEventId"] === where.externalEventId).length,
      ),
    },
    cambioEnlaceCita: {
      findMany: vi.fn(async ({ where }: any = {}) =>
        cambios
          .filter(
            (c) =>
              !where?.instanciaSalaId?.in ||
              where.instanciaSalaId.in.includes(c["instanciaSalaId"]),
          )
          .filter((c) =>
            where?.reunionAnteriorEliminadaAt === null
              ? c["reunionAnteriorEliminadaAt"] == null
              : true,
          )
          .map((c) => ({
            ...c,
            reunion: {
              externalId: reuniones[0]?.["externalId"] ?? null,
              cambiosCita: cambios
                .filter((x) => x["reunionProveedorId"] === c["reunionProveedorId"])
                .map((x) => ({ estado: x["estado"] })),
            },
          })),
      ),
      count: vi.fn(
        async ({ where }: any) =>
          cambios.filter(
            (c) =>
              c["reunionProveedorId"] === where.reunionProveedorId && c["estado"] !== "VERIFICADA",
          ).length,
      ),
      create: vi.fn(async ({ data }: any) => {
        const fila = {
          id: `c-${data.instanciaSalaId}`,
          eliminarDespuesDe: null,
          reunionAnteriorEliminadaAt: null,
          ...data,
        };
        cambios.push(fila);
        return { id: fila.id, estado: fila.estado };
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const fila = cambios.find((c) => c["id"] === where.id)!;
        Object.assign(fila, data);
        return { id: fila["id"], estado: fila["estado"] };
      }),
      updateMany: vi.fn(async ({ where, data }: any) => {
        const filas = cambios.filter(
          (c) =>
            (where.reunionProveedorId
              ? c["reunionProveedorId"] === where.reunionProveedorId
              : true) &&
            (where.id?.in ? where.id.in.includes(c["id"]) : true) &&
            (where.reunionAnteriorExternalId && typeof where.reunionAnteriorExternalId === "string"
              ? c["reunionAnteriorExternalId"] === where.reunionAnteriorExternalId
              : true) &&
            ("eliminarDespuesDe" in where ? c["eliminarDespuesDe"] == null : true) &&
            ("reunionAnteriorEliminadaAt" in where
              ? c["reunionAnteriorEliminadaAt"] == null
              : true),
        );
        filas.forEach((c) => Object.assign(c, data));
        return { count: filas.length };
      }),
    },
    auditoria: {
      create: vi.fn(async ({ data }: any) => {
        auditorias.push(data);
        return {};
      }),
      findFirst: vi.fn(async () => (auditorias.length ? { id: "aud-1" } : null)),
    },
  };
  const db = { ...tx, $transaction: vi.fn(async (cb: (t: typeof tx) => unknown) => cb(tx)) };

  const calendarios = new Map(
    instancias.map((_i, indice) => [
      `cal-${indice + 1}`,
      {
        description: `Clase\nZoom: ${viejo(indice + 1)}\nRepetido: ${viejo(indice + 1)}`,
        location: "Aula",
      } as Record<string, any>,
    ]),
  );
  const fallar = new Set<string>();
  const actualizar = vi.fn(async ({ eventId, cambio }: any) => {
    if (fallar.has(eventId)) {
      throw new Error("Calendar rechazó el parche.");
    }
    const { conferenceData, ...resto } = cambio;
    calendarios.set(eventId, { ...calendarios.get(eventId)!, ...resto });
  });
  const notificarCambioSerie = vi.fn(async () => ({
    estado: "COMPLETO" as const,
    destinatarios: 0,
    enviados: 0,
    yaEnviados: 0,
    enCurso: 0,
    errores: 0,
    detalle: [],
  }));
  const zoom = {
    buscarPorMarca: vi.fn(async () => null),
    crearRecurrente: vi.fn(
      async (): Promise<
        Readonly<{
          meetingId: string;
          joinUrl: string;
          occurrences?: readonly { occurrenceId: string; startTime: string; duration?: number }[];
        }>
      > => {
        zoomCreados.n += 1;
        return { meetingId: "999", joinUrl: NUEVO };
      },
    ),
    eliminar: vi.fn(async (_id: string) => undefined),
    eliminarOcurrencia: vi.fn(async () => undefined),
    actualizarOcurrencia: vi.fn(async () => undefined),
  };
  const deps: DependenciasCorreccionSerie = {
    db: db as unknown as PrismaClient,
    sincronizarEventos: vi.fn(async () => []),
    verificarReunionZoom: vi.fn(async () => ({ joinUrl: NUEVO })),
    calendar: {
      obtener: vi.fn(async ({ eventId }: any) => ({ ...calendarios.get(eventId)! })),
      actualizar,
    },
    zoom,
    enviarCorreo: vi.fn(async () => ({ sent: true })),
    notificarCambioSerie: notificarCambioSerie,
    ahora: () => ahora,
  };
  return {
    deps,
    db,
    instancias,
    reuniones,
    cambios,
    auditorias,
    zoomCreados,
    fallar,
    actualizar,
    calendarios,
    zoom,
    notificarCambioSerie,
  };
}

const corregir = (e: ReturnType<typeof crearEscenario>) =>
  corregirSerieEnlaces(e.deps, admin, { serieClave: SERIE });
const eventosZoom = (e: ReturnType<typeof crearEscenario>) =>
  e.instancias.flatMap((i) => i.eventosProveedor).filter((ev) => ev["proveedor"].tipo === "ZOOM");

describe("corregirSerieEnlaces", () => {
  it("rechaza a quien no es Administración", async () => {
    const e = crearEscenario();
    await expect(
      corregirSerieEnlaces(e.deps, { id: "d", rol: "DOCENTE" }, { serieClave: SERIE }),
    ).rejects.toMatchObject({ status: 403 });
    expect(e.db.$transaction).not.toHaveBeenCalled();
  });

  it("(a) camino feliz: una reunión nueva, citas verificadas, encuentros vinculados y limpieza diferida 7 días", async () => {
    const e = crearEscenario();
    const r = await corregir(e);
    expect(r).toMatchObject({
      resultado: "CORREGIDA",
      etapa: "AVISOS",
      encuentros: 3,
      reintentable: false,
    });
    expect(e.zoomCreados.n).toBe(1);
    expect(e.zoom.eliminar).not.toHaveBeenCalled();
    const zoom = eventosZoom(e);
    expect(new Set(zoom.map((ev) => ev["joinUrl"]))).toEqual(new Set([NUEVO]));
    expect(new Set(zoom.map((ev) => ev["externalEventId"]))).toEqual(new Set(["999"]));
    expect(new Set(zoom.map((ev) => ev["reunionProveedorId"]))).toEqual(new Set(["r1"]));
    expect(new Set(zoom.map((ev) => ev["cuentaProveedorId"]))).toEqual(new Set(["h1"]));
    expect(e.reuniones[0]).toMatchObject({
      estadoCreacion: "CREADA",
      externalId: "999",
      joinUrl: NUEVO,
      cuentaProveedorId: "h1",
    });
    expect(e.cambios.map((c) => c["estado"])).toEqual(["VERIFICADA", "VERIFICADA", "VERIFICADA"]);
    expect(e.cambios.map((c) => c["reunionAnteriorExternalId"])).toEqual(["100", "200", "300"]);
    expect(
      e.cambios.every((c) => c["eliminarDespuesDe"].getTime() === ahora.getTime() + 7 * 86_400_000),
    ).toBe(true);
    expect(e.auditorias).toHaveLength(1);
    expect(e.auditorias[0]).toMatchObject({
      accion: "SERIE_ENLACE_UNIFICADO",
      entidadTipo: "SerieReunion",
      entidadId: SERIE,
    });
  });

  it("(f) deja un solo enlace de Zoom en cada cita aunque tuviera uno repetido", async () => {
    const e = crearEscenario();
    await corregir(e);
    for (const descripcion of [...e.calendarios.values()].map(
      ({ description }) => description as string,
    )) {
      expect(descripcion.split(NUEVO)).toHaveLength(2);
      expect(descripcion).not.toMatch(/pwd=v\d/);
    }
  });

  it.each([["cal-1"], ["cal-2"], ["cal-3"]])(
    "(b) si falla el parche de %s ningún encuentro se vincula y el reintento retoma solo las pendientes",
    async (citaQueFalla) => {
      const e = crearEscenario();
      e.fallar.add(citaQueFalla);
      const r = await corregir(e);
      expect(r).toMatchObject({ resultado: "ERROR", etapa: "CALENDAR", reintentable: true });
      expect(eventosZoom(e).map((ev) => ev["reunionProveedorId"])).toEqual([null, null, null]);
      expect(eventosZoom(e).map((ev) => ev["externalEventId"])).toEqual(["100", "200", "300"]);
      expect(e.cambios.filter((c) => c["estado"] === "VERIFICADA")).toHaveLength(2);
      expect(e.auditorias).toHaveLength(0);
      expect(e.notificarCambioSerie).not.toHaveBeenCalled();

      e.fallar.clear();
      e.actualizar.mockClear();
      const reintento = await corregir(e);
      expect(reintento).toMatchObject({ resultado: "CORREGIDA" });
      expect(e.zoomCreados.n).toBe(1);
      expect(e.reuniones).toHaveLength(1);
      expect(e.actualizar).toHaveBeenCalledTimes(1);
      expect(e.cambios.map((c) => c["estado"])).toEqual(["VERIFICADA", "VERIFICADA", "VERIFICADA"]);
      expect(new Set(eventosZoom(e).map((ev) => ev["reunionProveedorId"]))).toEqual(
        new Set(["r1"]),
      );
    },
  );

  it("elimina ocurrencias sobrantes en Zoom al corregir la serie", async () => {
    const e = crearEscenario();
    e.zoom.crearRecurrente.mockResolvedValueOnce({
      meetingId: "999",
      joinUrl: NUEVO,
      occurrences: [
        { occurrenceId: "occ-1", startTime: "2026-11-10T12:00:00Z", duration: 60 },
        { occurrenceId: "occ-sobrante", startTime: "2026-11-12T12:00:00Z", duration: 60 },
        { occurrenceId: "occ-2", startTime: "2026-11-17T12:00:00Z", duration: 60 },
        { occurrenceId: "occ-3", startTime: "2026-11-24T12:00:00Z", duration: 60 },
      ],
    });

    const r = await corregir(e);
    expect(r).toMatchObject({ resultado: "CORREGIDA" });
    expect(e.zoom.eliminarOcurrencia).toHaveBeenCalledWith("999", "occ-sobrante");
  });

  it("(c) una serie sin citas de Calendar se corrige igual", async () => {
    const e = crearEscenario({ sinCitas: true });
    const r = await corregir(e);
    expect(r).toMatchObject({ resultado: "CORREGIDA" });
    expect(e.actualizar).not.toHaveBeenCalled();
    expect(e.cambios.every((c) => c["sinCita"] && c["estado"] === "VERIFICADA")).toBe(true);
    expect(new Set(eventosZoom(e).map((ev) => ev["joinUrl"]))).toEqual(new Set([NUEVO]));
  });

  it("(d) una serie ya unificada no hace llamadas externas ni cambios", async () => {
    const e = crearEscenario({ unificada: true });
    const r = await corregir(e);
    expect(r).toMatchObject({ resultado: "YA_UNIFICADA" });
    expect(e.zoom.crearRecurrente).not.toHaveBeenCalled();
    expect(e.actualizar).not.toHaveBeenCalled();
    expect(e.notificarCambioSerie).not.toHaveBeenCalled();
    expect(e.auditorias).toHaveLength(0);
  });

  it("(e) el aviso se registra como CORRECCION_ENLACE, una sola vez por serie", async () => {
    const e = crearEscenario();
    await corregir(e);
    expect(e.notificarCambioSerie).toHaveBeenCalledTimes(1);
    expect(e.notificarCambioSerie).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        serieClave: SERIE,
        tipo: "CORRECCION_ENLACE",
        joinUrl: NUEVO,
        instanciaIds: ["i1", "i2", "i3"],
      }),
    );
    // Reaplicar una serie ya corregida solo completa avisos pendientes (el envío es idempotente).
    const otra = await corregir(e);
    expect(otra).toMatchObject({ resultado: "YA_UNIFICADA" });
    expect(e.zoomCreados.n).toBe(1);
  });

  it("una serie mixta unifica solo los encuentros que ya están en Zoom y deja el de Meet para la migración", async () => {
    const e = crearEscenario({ mixta: true });
    const r = await corregir(e);
    expect(r).toMatchObject({
      resultado: "CORREGIDA",
      etapa: "AVISOS",
      encuentros: 2,
      reintentable: false,
    });
    expect(e.zoomCreados.n).toBe(1);
    const [z1, z2, z3] = eventosZoom(e);
    for (const evento of [z1, z2]) {
      expect(evento).toMatchObject({
        reunionProveedorId: "r1",
        joinUrl: NUEVO,
        externalEventId: "999",
        cuentaProveedorId: "h1",
      });
    }
    expect(z3).toMatchObject({ reunionProveedorId: null, joinUrl: viejo(3) });
    expect(e.instancias[2].proveedorActivoTipo).toBe("GOOGLE_MEET");
    expect(e.cambios).toHaveLength(2);
    expect(e.actualizar.mock.calls.map(([argumentos]: any[]) => argumentos.eventId)).not.toContain(
      "cal-3",
    );
    expect(e.auditorias[0].valorNuevo.instanciaIds).toEqual(["i1", "i2"]);
  });

  it("una serie mixta cuyos encuentros en Zoom ya comparten reunión no cambia nada", async () => {
    const e = crearEscenario({ mixta: true, unificada: true });
    const r = await corregir(e);
    expect(r).toMatchObject({ resultado: "YA_UNIFICADA" });
    expect(e.zoom.crearRecurrente).not.toHaveBeenCalled();
    expect(e.actualizar).not.toHaveBeenCalled();
  });

  it("si la sala no está libre en todos los horarios la serie queda sin cambios", async () => {
    const e = crearEscenario({ ocupaH1: true });
    const r = await corregir(e);
    expect(r).toMatchObject({ resultado: "OMITIDA", etapa: "VALIDACION" });
    expect(e.zoom.crearRecurrente).not.toHaveBeenCalled();
  });

  it("una serie con un encuentro dentro del margen de seguridad se difiere", async () => {
    const e = crearEscenario({ inicioPrimero: new Date("2026-11-03T20:00:00Z") });
    const r = await corregir(e);
    expect(r).toMatchObject({ resultado: "OMITIDA" });
    expect(r.mensaje).toContain("CERCANO");
  });

  it("si Zoom falla al crear la reunión no cambia nada y reintentar no deja otra reunión", async () => {
    const e = crearEscenario();
    e.zoom.crearRecurrente.mockRejectedValueOnce(new Error("Zoom caído"));
    expect(await corregir(e)).toMatchObject({
      resultado: "ERROR",
      etapa: "ZOOM",
      reintentable: true,
    });
    expect(eventosZoom(e).map((ev) => ev["reunionProveedorId"])).toEqual([null, null, null]);
    expect(await corregir(e)).toMatchObject({ resultado: "CORREGIDA" });
    expect(e.zoomCreados.n).toBe(1);
  });
});

describe("corregirSeriesEnlaces", () => {
  it("valida los límites del piloto y del lote y sigue con las demás series si una falla", async () => {
    const e = crearEscenario();
    await expect(
      corregirSeriesEnlaces(e.deps, admin, { modo: "PILOTO", serieClaves: ["a", "b"] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      corregirSeriesEnlaces(e.deps, admin, { modo: "LOTE", serieClaves: [] }),
    ).rejects.toMatchObject({ status: 400 });
    await expect(
      corregirSeriesEnlaces(e.deps, admin, {
        modo: "LOTE",
        serieClaves: Array.from({ length: 6 }, (_, i) => `serie:${i}`),
      }),
    ).rejects.toMatchObject({ status: 400 });
    const resultados = await corregirSeriesEnlaces(e.deps, admin, {
      modo: "LOTE",
      serieClaves: ["clave-invalida", SERIE],
    });
    expect(resultados.map(({ resultado }) => resultado)).toEqual(["OMITIDA", "CORREGIDA"]);
  });
});

describe("limpiarReunionesAntiguas", () => {
  const corregida = async () => {
    const e = crearEscenario();
    await corregir(e);
    return e;
  };
  const dias = (n: number) => new Date(ahora.getTime() + n * 86_400_000);

  it("(g) antes de siete días no elimina nada; después elimina cada reunión una vez y no repite", async () => {
    const e = await corregida();
    expect(await limpiarReunionesAntiguas(e.deps, admin, dias(6))).toEqual({
      eliminadas: 0,
      pendientes: 3,
      errores: 0,
    });
    expect(e.zoom.eliminar).not.toHaveBeenCalled();

    expect(await limpiarReunionesAntiguas(e.deps, admin, dias(8))).toEqual({
      eliminadas: 3,
      pendientes: 0,
      errores: 0,
    });
    expect(e.zoom.eliminar.mock.calls.map(([id]) => id).sort()).toEqual(["100", "200", "300"]);
    expect(await limpiarReunionesAntiguas(e.deps, admin, dias(9))).toEqual({
      eliminadas: 0,
      pendientes: 0,
      errores: 0,
    });
    expect(e.zoom.eliminar).toHaveBeenCalledTimes(3);
  });

  it("no elimina dos veces la misma reunión que comparten varias filas", async () => {
    const e = await corregida();
    e.cambios.forEach((c) => {
      c["reunionAnteriorExternalId"] = "100";
    });
    expect(await limpiarReunionesAntiguas(e.deps, admin, dias(8))).toEqual({
      eliminadas: 1,
      pendientes: 0,
      errores: 0,
    });
    expect(e.zoom.eliminar).toHaveBeenCalledTimes(1);
  });

  it("(h) no actúa en una serie que no tenga todas las citas verificadas", async () => {
    const e = await corregida();
    e.cambios[1]["estado"] = "PARCHEADA";
    const r = await limpiarReunionesAntiguas(e.deps, admin, dias(8));
    expect(r.eliminadas).toBe(0);
    expect(e.zoom.eliminar).not.toHaveBeenCalled();
  });

  it("cuenta el error de una eliminación y deja esa fila para reintentar; solo Administración", async () => {
    const e = await corregida();
    e.zoom.eliminar.mockRejectedValueOnce(new Error("Zoom caído"));
    const r = await limpiarReunionesAntiguas(e.deps, admin, dias(8));
    expect(r).toEqual({ eliminadas: 2, pendientes: 0, errores: 1 });
    await expect(
      limpiarReunionesAntiguas(e.deps, { id: "d", rol: "DOCENTE" }, dias(8)),
    ).rejects.toMatchObject({ status: 403 });
  });
});
