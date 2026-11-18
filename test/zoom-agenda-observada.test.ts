import { describe, expect, it } from "vitest";
import { interpretarMovimientoReunionZoom } from "../src/integrations/zoom/zoom-agenda";
import { detectarInconsistenciasAgendaZoom } from "../src/modules/operaciones/zoom-agenda-observada.domain";
import {
  registrarMovimientoReunionZoom,
  reservasZoomExternas
} from "../src/modules/operaciones/zoom-agenda-observada.service";

const cuerpo = (event: string, object: Record<string, unknown>) =>
  JSON.stringify({ event, event_ts: 1, payload: { account_id: "acc", object } });

describe("movimientos de reuniones de Zoom", () => {
  it("lee una reunión programada con su horario", () => {
    const mov = interpretarMovimientoReunionZoom(
      cuerpo("meeting.created", {
        id: 123,
        host_id: "h1",
        topic: "Clase",
        type: 2,
        start_time: "2026-11-20T12:00:00Z",
        duration: 90
      })
    );
    expect(mov).toMatchObject({
      tipo: "created",
      meetingId: "123",
      anfitrionZoomId: "h1",
      sinHorarioFijo: false
    });
    expect(mov?.ocurrencias).toEqual([
      { ocurrenciaZoomId: "", inicio: new Date("2026-11-20T12:00:00Z"), duracionMin: 90 }
    ]);
  });

  it("lee las ocurrencias de una recurrente y descarta las borradas", () => {
    const mov = interpretarMovimientoReunionZoom(
      cuerpo("meeting.updated", {
        id: 1,
        host_id: "h1",
        type: 8,
        duration: 60,
        occurrences: [
          { occurrence_id: "a", start_time: "2026-11-20T12:00:00Z", duration: 60 },
          { occurrence_id: "b", start_time: "2026-11-27T12:00:00Z", status: "deleted" }
        ]
      })
    );
    expect(mov?.ocurrencias.map(({ ocurrenciaZoomId }) => ocurrenciaZoomId)).toEqual(["a"]);
  });

  it("ignora eventos ajenos o sin anfitrión", () => {
    expect(interpretarMovimientoReunionZoom(cuerpo("meeting.started", { id: 1, host_id: "h" }))).toBeNull();
    expect(interpretarMovimientoReunionZoom(cuerpo("meeting.created", { id: 1 }))).toBeNull();
  });
});

const hoy = new Date("2026-11-17T12:00:00Z");
const h = (dia: number, hora: number) => new Date(Date.UTC(2026, 10, dia, hora));
const reunion = (id: string, meetingId: string, inicio: Date, fin: Date) => ({
  instanciaId: id,
  solicitudId: `s-${id}`,
  titulo: `Clase ${id}`,
  inicio,
  fin,
  cuentaId: "c1",
  meetingId
});
const obs = (id: string, meetingId: string, inicio: Date, fin: Date, estado = "ACTIVA") => ({
  id,
  meetingId,
  ocurrenciaZoomId: "",
  cuentaProveedorId: "c1",
  tema: "Tema",
  inicio,
  fin,
  estado
});

describe("inconsistencias de agenda", () => {
  it("marca como externa la reunión que la app no conoce y detecta su choque", () => {
    const local = reunion("1", "100", h(20, 12), h(20, 13));
    const resultado = detectarInconsistenciasAgendaZoom(
      [obs("o1", "999", h(20, 12), h(20, 14)), obs("o2", "100", h(20, 12), h(20, 13))],
      [local],
      new Set(["100"]),
      hoy
    );
    expect(resultado.externas).toHaveLength(1);
    expect(resultado.externas[0]?.choques).toEqual([local]);
    expect(resultado.eliminadasEnZoom).toEqual([]);
    expect(resultado.horarioDistinto).toEqual([]);
  });

  it("detecta reuniones eliminadas y con horario distinto en Zoom", () => {
    const eliminada = reunion("1", "100", h(20, 12), h(20, 13));
    const movida = reunion("2", "200", h(21, 12), h(21, 13));
    const resultado = detectarInconsistenciasAgendaZoom(
      [obs("o1", "100", h(20, 12), h(20, 13), "ELIMINADA"), obs("o2", "200", h(21, 15), h(21, 16))],
      [eliminada, movida],
      new Set(["100", "200"]),
      hoy
    );
    expect(resultado.eliminadasEnZoom).toEqual([eliminada]);
    expect(resultado.horarioDistinto.map(({ reunion: r }) => r.instanciaId)).toEqual(["2"]);
  });

  it("no marca encuentros que ya empezaron aunque Zoom no los liste", () => {
    const enCurso = reunion("1", "100", h(17, 11), h(17, 13));
    const resultado = detectarInconsistenciasAgendaZoom(
      [obs("o1", "100", h(17, 11), h(17, 13), "ELIMINADA")],
      [enCurso],
      new Set(["100"]),
      hoy
    );
    expect(resultado.eliminadasEnZoom).toEqual([]);
    expect(resultado.horarioDistinto).toEqual([]);
  });

  it("sin datos de Zoom para la reunión no afirma nada", () => {
    const resultado = detectarInconsistenciasAgendaZoom(
      [],
      [reunion("1", "100", h(20, 12), h(20, 13))],
      new Set(["100"]),
      hoy
    );
    expect(resultado.eliminadasEnZoom).toEqual([]);
    expect(resultado.horarioDistinto).toEqual([]);
  });
});

type Fila = {
  id: string;
  cuentaZoomId: string;
  meetingId: string;
  ocurrenciaZoomId: string;
  anfitrionZoomId: string;
  cuentaProveedorId: string | null;
  tema: string;
  inicioAt: Date;
  finAt: Date;
  estado: string;
  origen: string;
  observadaAt: Date;
};

/** Base en memoria mínima: solo lo que usan el registro de movimientos y las reservas externas. */
function baseFalsa(propias: string[] = []) {
  const filas: Fila[] = [];
  const coincide = (fila: Fila, where: Record<string, unknown>) =>
    Object.entries(where).every(([campo, valor]) => {
      const actual = (fila as unknown as Record<string, unknown>)[campo];
      if (valor && typeof valor === "object" && "in" in valor) {
        return (valor.in as unknown[]).includes(actual);
      }
      if (valor && typeof valor === "object" && ("lt" in valor || "gt" in valor)) {
        const v = valor as { lt?: Date; gt?: Date };
        return (!v.lt || (actual as Date) < v.lt) && (!v.gt || (actual as Date) > v.gt);
      }
      return actual === valor;
    });
  const db = {
    cuentaProveedor: { findFirst: async () => ({ id: "c1" }) },
    eventoProveedor: {
      findMany: async () => propias.map((id) => ({ codigoReunion: id, externalEventId: null }))
    },
    reunionZoomObservada: {
      findMany: async ({ where }: { where: Record<string, unknown> }) =>
        filas.filter((f) => coincide(f, where)),
      updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Partial<Fila> }) => {
        filas.filter((f) => coincide(f, where)).forEach((f) => Object.assign(f, data));
        return { count: 1 };
      },
      update: async ({ where, data }: { where: { id: string }; data: Partial<Fila> }) =>
        Object.assign(
          filas.find((f) => f.id === where.id)!,
          data
        ),
      upsert: async ({
        where,
        create,
        update
      }: {
        where: {
          cuentaZoomId_meetingId_ocurrenciaZoomId: Pick<
            Fila,
            "cuentaZoomId" | "meetingId" | "ocurrenciaZoomId"
          >;
        };
        create: Omit<Fila, "id">;
        update: Partial<Fila>;
      }) => {
        const existente = filas.find((f) => coincide(f, where.cuentaZoomId_meetingId_ocurrenciaZoomId));
        if (existente) {
          return Object.assign(existente, update);
        }
        const nueva = { ...create, id: `f${filas.length}` } as Fila;
        filas.push(nueva);
        return nueva;
      }
    }
  };
  return { db: db as never, filas };
}

describe("registro de movimientos y reservas externas", () => {
  const movimiento = (tipo: "created" | "deleted", extra: Record<string, unknown> = {}) =>
    interpretarMovimientoReunionZoom(
      cuerpo(`meeting.${tipo}`, {
        id: 555,
        host_id: "h1",
        type: 2,
        start_time: "2026-11-20T12:00:00Z",
        duration: 60,
        ...extra
      })
    )!;

  it("una reunión creada en Zoom ocupa la sala y al borrarse la libera", async () => {
    const { db, filas } = baseFalsa();
    const desde = new Date("2026-11-20T00:00:00Z");
    const hasta = new Date("2026-11-21T00:00:00Z");
    await registrarMovimientoReunionZoom(db, movimiento("created"), hoy);
    expect(await reservasZoomExternas(db, { cuentaIds: ["c1"], desde, hasta }, hoy)).toEqual([
      {
        cuentaProveedorId: "c1",
        inicio: new Date("2026-11-20T12:00:00Z"),
        fin: new Date("2026-11-20T13:00:00Z")
      }
    ]);
    await registrarMovimientoReunionZoom(db, movimiento("deleted"), hoy);
    expect(filas[0]?.estado).toBe("ELIMINADA");
    expect(await reservasZoomExternas(db, { cuentaIds: ["c1"], desde, hasta }, hoy)).toEqual([]);
  });

  it("las reuniones creadas por la app no cuentan como externas", async () => {
    const { db } = baseFalsa(["555"]);
    await registrarMovimientoReunionZoom(db, movimiento("created"), hoy);
    expect(
      await reservasZoomExternas(
        db,
        {
          cuentaIds: ["c1"],
          desde: new Date("2026-11-20T00:00:00Z"),
          hasta: new Date("2026-11-21T00:00:00Z")
        },
        hoy
      )
    ).toEqual([]);
  });

  it("no modifica ocurrencias que ya empezaron ni borra las transcurridas", async () => {
    const { db, filas } = baseFalsa();
    // Ahora son las 12:30: la clase de las 12:00 está en curso.
    const ahora = new Date("2026-11-20T12:30:00Z");
    filas.push({
      id: "enCurso",
      cuentaZoomId: "acc",
      meetingId: "555",
      ocurrenciaZoomId: "",
      anfitrionZoomId: "h1",
      cuentaProveedorId: "c1",
      tema: "Original",
      inicioAt: new Date("2026-11-20T12:00:00Z"),
      finAt: new Date("2026-11-20T13:00:00Z"),
      estado: "ACTIVA",
      origen: "PULL",
      observadaAt: hoy
    });
    await registrarMovimientoReunionZoom(db, movimiento("deleted"), ahora);
    await registrarMovimientoReunionZoom(
      db,
      movimiento("created", { start_time: "2026-11-20T15:00:00Z" }),
      ahora
    );
    expect(filas[0]).toMatchObject({ estado: "ACTIVA", tema: "Original", origen: "PULL" });
    expect(filas[0]?.inicioAt).toEqual(new Date("2026-11-20T12:00:00Z"));
  });

  it("no registra una reunión que ya terminó", async () => {
    const { db, filas } = baseFalsa();
    await registrarMovimientoReunionZoom(db, movimiento("created"), new Date("2026-11-20T14:00:00Z"));
    expect(filas).toHaveLength(0);
  });
});
