import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  detectarInconsistenciasAgendaZoom,
  elegirOcurrenciaDelEncuentro
} from "../src/modules/operaciones/zoom-agenda-observada.domain";
import {
  adoptarHorarioDeZoom,
  corregirHorarioEnZoom,
  ignorarReunionExterna,
  recrearReunionEnZoom
} from "../src/modules/operaciones/zoom-agenda-acciones.service";

const ahora = new Date("2026-11-17T12:00:00Z");
const h = (dia: number, hora: number) => new Date(Date.UTC(2026, 10, dia, hora));
const reunion = (id: string, meetingId: string, inicio: Date) => ({
  instanciaId: id,
  solicitudId: `s-${id}`,
  titulo: `Clase ${id}`,
  inicio,
  fin: new Date(inicio.getTime() + 3_600_000),
  cuentaId: "c1",
  meetingId
});
const obs = (id: string, meetingId: string, inicio: Date, extra = {}) => ({
  id,
  meetingId,
  ocurrenciaZoomId: "",
  cuentaProveedorId: "c1",
  tema: "T",
  inicio,
  fin: new Date(inicio.getTime() + 3_600_000),
  estado: "ACTIVA",
  ...extra
});
const fila = (o: ReturnType<typeof obs>) => ({
  ...o,
  inicioAt: o.inicio,
  finAt: o.fin,
  observadaAt: ahora,
  ignoradaAt: null
});

describe("ignoradas en el dominio", () => {
  it("una reunión externa ignorada no cuenta como externa ni como choque", () => {
    const r = detectarInconsistenciasAgendaZoom(
      [obs("o1", "999", h(20, 12), { ignoradaAt: ahora }), obs("o2", "998", h(21, 12))],
      [reunion("1", "100", h(20, 12))],
      new Set(["100"]),
      ahora
    );
    expect(r.externas.map(({ observada }) => observada.id)).toEqual(["o2"]);
    expect(r.ignoradas.map(({ id }) => id)).toEqual(["o1"]);
  });

  it("no adivina la ocurrencia si la más cercana es de otro encuentro", () => {
    const a = reunion("1", "100", h(20, 12));
    const b = reunion("2", "100", h(27, 12));
    const enZoom = [obs("o1", "100", h(27, 12), { ocurrenciaZoomId: "x" })];
    expect(elegirOcurrenciaDelEncuentro(a, enZoom, [a, b]).ok).toBe(false);
    expect(elegirOcurrenciaDelEncuentro(a, [obs("o3", "100", h(20, 14))], [a, b]).ok).toBe(true);
  });

  it("dos encuentros movidos en Zoom: la cercanía sola no prueba la correspondencia", () => {
    const a = reunion("1", "100", h(20, 12));
    const b = reunion("2", "100", h(20, 15));
    // Una sola ocurrencia en Zoom, a las 16: es más cercana a b que a a, así que no se atribuye a a.
    const enZoom = [obs("o1", "100", h(20, 16), { ocurrenciaZoomId: "x" })];
    expect(elegirOcurrenciaDelEncuentro(a, enZoom, [a, b]).ok).toBe(false);
    expect(elegirOcurrenciaDelEncuentro(b, enZoom, [a, b]).ok).toBe(true);
  });
});

function entorno(
  opciones: {
    zoomFalla?: boolean;
    observadas?: unknown[];
    reclamoOcupado?: boolean;
    encuentroMovido?: boolean;
  } = {}
) {
  const local = reunion("1", "100", h(20, 12));
  const escrituras = vi.fn(async (..._args: unknown[]) => ({ count: 1 }));
  const reclamos = vi.fn(async (..._args: unknown[]) => ({ count: opciones.reclamoOcupado ? 0 : 1 }));
  const db = {
    reunionZoomObservada: {
      findMany: async () => opciones.observadas ?? [fila(obs("o1", "100", h(20, 15)))],
      update: escrituras,
      findUnique: async () => ({ id: "o1", meetingId: "999", ignoradaAt: null })
    },
    eventoProveedor: {
      findMany: async () => [{ codigoReunion: "100", externalEventId: "100" }],
      // El primer updateMany de «recrear» es el reclamo exclusivo; los demás son escrituras reales.
      updateMany: async (arg: { data?: Record<string, unknown> }) =>
        arg.data && "reclamoIntegracionToken" in arg.data && !("externalEventId" in arg.data)
          ? reclamos(arg)
          : escrituras(arg)
    },
    instanciaSala: {
      findUnique: async () => ({
        estado: "PROGRAMADA",
        timezone: "America/Montevideo",
        requiereGrabacion: false,
        inicioProgramadoAt: opciones.encuentroMovido
          ? new Date(local.inicio.getTime() + 3_600_000)
          : local.inicio,
        finProgramadoAt: local.fin,
        proveedorActivoTipo: "ZOOM",
        solicitud: { titulo: "Clase" },
        eventosProveedor: [
          {
            id: "e1",
            externalEventId: "100",
            reunionProveedorId: null,
            cuentaProveedor: { emailOrganizador: "a@b.c" },
            proveedor: { tipo: "ZOOM" }
          }
        ]
      })
    },
    auditoria: { create: escrituras },
    $transaction: async (ops: unknown[]) => Promise.all(ops)
  };
  const zoom = {
    actualizarHorario: vi.fn(async () => {
      if (opciones.zoomFalla) {
        throw new Error("boom");
      }
    }),
    crearReunion: vi.fn(async () => {
      if (opciones.zoomFalla) {
        throw new Error("boom");
      }
      return { meetingId: "200", joinUrl: "https://zoom.us/j/200" };
    })
  };
  const reprogramarEncuentro = vi.fn(async () => ({ eventoProveedorIds: [] }));
  const eliminarEncuentro = vi.fn(async () => ({ eventoProveedorIds: [] }));
  const deps = {
    db: db as never,
    reuniones: async () => [local],
    zoom,
    reprogramarEncuentro,
    eliminarEncuentro,
    ahora: () => ahora
  };
  return { deps, escrituras, reclamos, zoom, reprogramarEncuentro, eliminarEncuentro };
}

const admin = { id: "u", rol: "ADMINISTRACION", activo: true } as never;
const docente = { id: "d", rol: "DOCENTE", activo: true } as never;

describe("acciones de la agenda de Zoom", () => {
  beforeEach(() => vi.clearAllMocks());

  it("si Zoom falla al corregir el horario no se escribe nada local", async () => {
    const { deps, escrituras } = entorno({ zoomFalla: true });
    await expect(corregirHorarioEnZoom(deps, admin, { instanciaId: "1" })).rejects.toThrow(
      /No se cambió nada/
    );
    expect(escrituras).not.toHaveBeenCalled();
  });

  it("corrige en Zoom con la zona explícita y deja auditoría", async () => {
    const { deps, zoom, escrituras } = entorno();
    await corregirHorarioEnZoom(deps, admin, { instanciaId: "1" });
    expect(zoom.actualizarHorario).toHaveBeenCalledWith("100", "", {
      startTime: h(20, 12),
      durationMinutes: 60,
      timezone: "America/Montevideo"
    });
    expect(escrituras).toHaveBeenCalled();
  });

  it("si Zoom falla al recrear no se toca el encuentro", async () => {
    const { deps, escrituras } = entorno({
      zoomFalla: true,
      observadas: [fila(obs("o1", "100", h(20, 12), { estado: "ELIMINADA" }))]
    });
    await expect(recrearReunionEnZoom(deps, admin, { instanciaId: "1" })).rejects.toThrow(
      /No se cambió nada/
    );
    expect(escrituras).not.toHaveBeenCalled();
  });

  it("recrear reclama el encuentro antes de llamar a Zoom: si otra operación lo tiene, no crea nada", async () => {
    const { deps, zoom } = entorno({
      reclamoOcupado: true,
      observadas: [fila(obs("o1", "100", h(20, 12), { estado: "ELIMINADA" }))]
    });
    await expect(recrearReunionEnZoom(deps, admin, { instanciaId: "1" })).rejects.toThrow(/otra operación/);
    expect(zoom.crearReunion).not.toHaveBeenCalled();
  });

  it("corregir recomprueba el horario justo antes de tocar Zoom", async () => {
    const { deps, zoom } = entorno({ encuentroMovido: true });
    await expect(corregirHorarioEnZoom(deps, admin, { instanciaId: "1" })).rejects.toThrow(/cambió/);
    expect(zoom.actualizarHorario).not.toHaveBeenCalled();
  });

  it("si la auditoría complementaria de adoptar falla, igual se devuelven los eventos pendientes", async () => {
    const { deps } = entorno();
    (deps.db as unknown as { auditoria: { create: () => Promise<never> } }).auditoria.create = () =>
      Promise.reject(new Error("auditoría caída"));
    await expect(adoptarHorarioDeZoom(deps, admin, { instanciaId: "1" })).resolves.toEqual({
      eventoProveedorIds: []
    });
  });

  it("adoptar delega en la reprogramación existente con el horario de Zoom", async () => {
    const { deps, reprogramarEncuentro } = entorno();
    await adoptarHorarioDeZoom(deps, admin, { instanciaId: "1" });
    expect(reprogramarEncuentro).toHaveBeenCalledWith(admin, "s-1", "1", {
      accion: "EDITAR_FECHA",
      inicio: h(20, 15),
      fin: h(20, 16)
    });
  });

  it("solo Administración puede ejecutar cada acción", async () => {
    const { deps, zoom, reprogramarEncuentro, eliminarEncuentro } = entorno();
    await expect(corregirHorarioEnZoom(deps, docente, { instanciaId: "1" })).rejects.toThrow(
      /Administración/
    );
    await expect(adoptarHorarioDeZoom(deps, docente, { instanciaId: "1" })).rejects.toThrow(/Administración/);
    await expect(recrearReunionEnZoom(deps, docente, { instanciaId: "1" })).rejects.toThrow(/Administración/);
    await expect(
      ignorarReunionExterna(deps.db, docente, { observadaId: "o1", ignorar: true })
    ).rejects.toThrow(/Administración/);
    expect(zoom.actualizarHorario).not.toHaveBeenCalled();
    expect(zoom.crearReunion).not.toHaveBeenCalled();
    expect(reprogramarEncuentro).not.toHaveBeenCalled();
    expect(eliminarEncuentro).not.toHaveBeenCalled();
  });
});
