import { beforeEach, describe, expect, it, vi } from "vitest";
import { sincronizarEventosPendientesUseCase } from "../src/modules/conferencias/application";
import type {
  ClaimInfo,
  ConferenceProviderFactory,
  ConferenciasRepositoryPort
} from "../src/modules/conferencias/ports";
import type { UsoReunionCompartida } from "../src/modules/reuniones/reunion-compartida.domain";
import {
  actualizarReunionZoomHttp,
  buscarReunionZoomPorMarcaHttp,
  crearReunionZoomHttp,
  crearReunionZoomRecurrenteHttp,
  eliminarReunionZoomHttp,
  obtenerReunionZoomHttp
} from "@/src/integrations/zoom/zoom-client";

vi.mock("@/src/integrations/zoom/zoom-client", () => ({
  obtenerZoomAccessToken: vi.fn(async () => "tok"),
  crearReunionZoomHttp: vi.fn(async () => ({ meetingId: "propia-1", joinUrl: "https://zoom.us/j/propia-1" })),
  crearReunionZoomRecurrenteHttp: vi.fn(async () => ({
    meetingId: "serie-1",
    joinUrl: "https://zoom.us/j/serie-1"
  })),
  buscarReunionZoomPorMarcaHttp: vi.fn(async () => null),
  actualizarReunionZoomHttp: vi.fn(async () => {}),
  eliminarReunionZoomHttp: vi.fn(async () => {}),
  eliminarOcurrenciaZoomHttp: vi.fn(async () => {}),
  obtenerReunionZoomHttp: vi.fn(async (_t: string, id: string) => ({
    meetingId: id,
    joinUrl: `https://zoom.us/j/${id}`
  }))
}));

const ahora = new Date();
const enHoras = (h: number) => new Date(ahora.getTime() + h * 3_600_000);
const factory: ConferenceProviderFactory = vi.fn() as unknown as ConferenceProviderFactory;

type EstadoReunion = {
  estadoCreacion: "PENDIENTE" | "CREANDO" | "CREADA" | "ELIMINADA";
  reclamoToken: string | null;
  externalId: string | null;
  joinUrl: string | null;
  usos: UsoReunionCompartida[];
};

/** Repositorio en memoria: modela el reclamo de creación de la reunión compartida. */
function crearRepo(opciones: {
  eventos: Record<
    string,
    { reunion: boolean; operacion: ClaimInfo["operacion"]; externalEventId?: string | null }
  >;
  reunion?: Partial<EstadoReunion>;
}) {
  const reunion: EstadoReunion = {
    estadoCreacion: "PENDIENTE",
    reclamoToken: null,
    externalId: null,
    joinUrl: null,
    usos: [],
    ...opciones.reunion
  };
  const finalizadas: string[] = [];
  const persistidas: Record<string, { externalEventId: string | null; joinUrl: string }> = {};

  const repo = {
    obtenerSnapshotsEventos: vi.fn(async (ids: readonly string[]) =>
      ids.map((id) => ({
        id,
        estadoIntegracion: "PENDIENTE",
        operacionPendiente: opciones.eventos[id].operacion,
        reclamoIntegracionAt: null,
        errorIntegracion: null
      }))
    ),
    obtenerEstadoActual: vi.fn(async (id: string) => ({ eventoProveedorId: id, estado: "SINCRONIZADA" })),
    obtenerCredencialesZoom: vi.fn(async () => ({
      disponible: true,
      accountId: "a",
      clientId: "c",
      clientSecret: "s"
    })),
    reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo> => ({
      event: {
        id,
        proveedorTipo: "ZOOM",
        solicitudSalaId: "sol-1",
        organizerEmail: "sala01@flacso.edu.uy",
        externalEventId: opciones.eventos[id].externalEventId ?? null,
        reunionProveedorId: opciones.eventos[id].reunion ? "reunion-1" : null,
        serieClave: opciones.eventos[id].reunion ? "serie-abc" : null,
        request: {
          titulo: "Seminario",
          descripcion: "Clase",
          inicio: enHoras(24),
          fin: enHoras(26),
          timezone: "America/Montevideo",
          calendarId: "x",
          calendarEventId: "y"
        }
      },
      operacion: opciones.eventos[id].operacion,
      at: new Date(),
      token: `claim-${id}`
    })),
    guardarExternalEventIdTemprano: vi.fn(async () => {}),
    persistirMeetDetectado: vi.fn(
      async (claim: ClaimInfo, result: { externalEventId: string | null; joinUrl: string }) => {
        persistidas[claim.event.id] = { externalEventId: result.externalEventId, joinUrl: result.joinUrl };
      }
    ),
    finalizarOperacion: vi.fn(async (claim: ClaimInfo) => {
      finalizadas.push(claim.event.id);
      return true;
    }),
    registrarErrorReclamado: vi.fn(async (claim: ClaimInfo, error: string) => ({
      eventoProveedorId: claim.event.id,
      estado: "ERROR",
      error
    })),
    reclamarCreacionReunionCompartida: vi.fn(async (eventoId: string, token: string) => {
      if (reunion.estadoCreacion === "CREADA") {
        return {
          reunionId: "reunion-1",
          resultado: "YA_CREADA" as const,
          externalId: reunion.externalId,
          joinUrl: reunion.joinUrl
        };
      }
      if (
        reunion.estadoCreacion === "CREANDO" &&
        reunion.reclamoToken !== token &&
        reunion.reclamoToken !== "vencido"
      ) {
        return {
          reunionId: "reunion-1",
          resultado: "EN_CURSO_POR_OTRO" as const,
          externalId: null,
          joinUrl: null
        };
      }
      reunion.estadoCreacion = "CREANDO";
      reunion.reclamoToken = token;
      void eventoId;
      return {
        reunionId: "reunion-1",
        resultado: "RECLAMADA" as const,
        externalId: reunion.externalId,
        joinUrl: null
      };
    }),
    registrarExternalIdTemprano: vi.fn(async (_r: string, _t: string, externalId: string) => {
      reunion.externalId = externalId;
    }),
    guardarReunionCompartida: vi.fn(
      async (_r: string, _t: string, datos: { externalId: string; joinUrl: string }) => {
        reunion.estadoCreacion = "CREADA";
        reunion.externalId = datos.externalId;
        reunion.joinUrl = datos.joinUrl;
      }
    ),
    usosDeReunionCompartida: vi.fn(async () => ({
      usos: reunion.usos,
      externalId: reunion.externalId,
      eliminada: reunion.estadoCreacion === "ELIMINADA"
    })),
    marcarReunionCompartidaEliminada: vi.fn(async () => {
      if (reunion.estadoCreacion === "ELIMINADA") {
        return false;
      }
      reunion.estadoCreacion = "ELIMINADA";
      return true;
    }),
    vincularEventoReunionCompartida: vi.fn(async () => {}),
    liberarReclamoEvento: vi.fn(async () => {})
  };
  return {
    repo: repo as unknown as ConferenciasRepositoryPort,
    mocks: repo,
    reunion,
    finalizadas,
    persistidas
  };
}

const uso = (id: string, estado = "PROGRAMADA", fin = enHoras(30)): UsoReunionCompartida => ({
  eventoProveedorId: id,
  instanciaEstado: estado,
  instanciaFin: fin
});

beforeEach(() => {
  vi.clearAllMocks();
});

describe("aprovisionamiento Zoom con reunión compartida", () => {
  it("dos encuentros de la misma serie crean una sola reunión Zoom y terminan con el mismo enlace", async () => {
    const { repo, persistidas } = crearRepo({
      eventos: {
        e1: { reunion: true, operacion: "PROVISIONAR" },
        e2: { reunion: true, operacion: "PROVISIONAR" }
      }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1", "e2"]);
    expect(crearReunionZoomRecurrenteHttp).toHaveBeenCalledTimes(1);
    expect(crearReunionZoomHttp).not.toHaveBeenCalled();
    expect(persistidas.e1.joinUrl).toBe("https://zoom.us/j/serie-1");
    expect(persistidas.e2.joinUrl).toBe("https://zoom.us/j/serie-1");
    expect(persistidas.e1.externalEventId).toBe("serie-1");
    expect(persistidas.e2.externalEventId).toBe("serie-1");
  });

  it("la reunión nueva lleva la marca de la serie en su agenda", async () => {
    const { repo } = crearRepo({ eventos: { e1: { reunion: true, operacion: "PROVISIONAR" } } });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    const llamada = vi.mocked(crearReunionZoomRecurrenteHttp).mock.calls[0][2];
    expect(llamada.agenda).toContain("[serie:serie-abc]");
    expect(llamada.recurrence).toMatchObject({ type: 2, repeatInterval: 1 });
    expect(vi.mocked(buscarReunionZoomPorMarcaHttp).mock.calls[0][2]).toBe("[serie:serie-abc]");
  });

  it("con dos reclamos simultáneos solo uno llama a Zoom y el otro espera", async () => {
    let liberar: () => void = () => {};
    vi.mocked(crearReunionZoomRecurrenteHttp).mockImplementationOnce(
      () =>
        new Promise((resolver) => {
          liberar = () => resolver({ meetingId: "serie-1", joinUrl: "https://zoom.us/j/serie-1" });
        })
    );
    const { repo, mocks } = crearRepo({
      eventos: {
        e1: { reunion: true, operacion: "PROVISIONAR" },
        e2: { reunion: true, operacion: "PROVISIONAR" }
      }
    });
    const primero = sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    await vi.waitFor(() => expect(mocks.registrarExternalIdTemprano).not.toHaveBeenCalled());
    await vi.waitFor(() => expect(crearReunionZoomRecurrenteHttp).toHaveBeenCalledTimes(1));
    const segundo = await sincronizarEventosPendientesUseCase(repo, factory, ["e2"]);
    expect(crearReunionZoomRecurrenteHttp).toHaveBeenCalledTimes(1);
    expect(mocks.liberarReclamoEvento).toHaveBeenCalledTimes(1);
    expect(mocks.finalizarOperacion).not.toHaveBeenCalled();
    expect(segundo[0].estado).not.toBe("SINCRONIZADA");
    liberar();
    await primero;
    expect(crearReunionZoomRecurrenteHttp).toHaveBeenCalledTimes(1);
  });

  it("un reclamo vencido tras un POST que sí llegó a Zoom reutiliza la reunión huérfana y no crea otra", async () => {
    vi.mocked(buscarReunionZoomPorMarcaHttp).mockResolvedValueOnce({
      meetingId: "huerfana-9",
      joinUrl: "https://zoom.us/j/huerfana-9"
    });
    const { repo, mocks, persistidas } = crearRepo({
      eventos: { e1: { reunion: true, operacion: "PROVISIONAR" } },
      reunion: { estadoCreacion: "CREANDO", reclamoToken: "vencido" }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(crearReunionZoomRecurrenteHttp).not.toHaveBeenCalled();
    expect(mocks.registrarExternalIdTemprano).toHaveBeenCalledWith("reunion-1", "claim-e1", "huerfana-9");
    expect(persistidas.e1.externalEventId).toBe("huerfana-9");
  });

  it("vincula el evento reclamado a la reunión compartida, también cuando la reunión ya existía", async () => {
    const { repo, mocks } = crearRepo({
      eventos: { e2: { reunion: true, operacion: "PROVISIONAR" } },
      reunion: { estadoCreacion: "CREADA", externalId: "serie-1", joinUrl: "https://zoom.us/j/serie-1" }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e2"]);
    expect(crearReunionZoomRecurrenteHttp).not.toHaveBeenCalled();
    expect(mocks.vincularEventoReunionCompartida).toHaveBeenCalledWith(
      expect.objectContaining({ token: "claim-e2" }),
      { externalId: "serie-1", joinUrl: "https://zoom.us/j/serie-1" }
    );
  });

  it("guarda el ID de Zoom apenas lo recibe, antes de guardar el resultado final", async () => {
    const orden: string[] = [];
    const { repo, mocks } = crearRepo({ eventos: { e1: { reunion: true, operacion: "PROVISIONAR" } } });
    mocks.registrarExternalIdTemprano.mockImplementation(async () => {
      orden.push("temprano");
    });
    mocks.guardarReunionCompartida.mockImplementation(async () => {
      orden.push("final");
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(orden).toEqual(["temprano", "final"]);
  });

  it("un evento sin reunión compartida sigue creando su propia reunión", async () => {
    const { repo, mocks } = crearRepo({ eventos: { e1: { reunion: false, operacion: "PROVISIONAR" } } });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(crearReunionZoomHttp).toHaveBeenCalledTimes(1);
    expect(crearReunionZoomRecurrenteHttp).not.toHaveBeenCalled();
    expect(mocks.reclamarCreacionReunionCompartida).not.toHaveBeenCalled();
  });

  it("REPROGRAMAR de un evento compartido no cambia horarios en Zoom, solo refresca el enlace", async () => {
    const { repo, persistidas } = crearRepo({
      eventos: { e1: { reunion: true, operacion: "REPROGRAMAR", externalEventId: "serie-1" } }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(actualizarReunionZoomHttp).not.toHaveBeenCalled();
    expect(obtenerReunionZoomHttp).toHaveBeenCalledWith("tok", "serie-1");
    expect(persistidas.e1.joinUrl).toBe("https://zoom.us/j/serie-1");
  });

  it("un evento sin reunión compartida sigue reprogramando en Zoom como hoy", async () => {
    const { repo } = crearRepo({
      eventos: { e1: { reunion: false, operacion: "REPROGRAMAR", externalEventId: "propia-1" } }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(actualizarReunionZoomHttp).toHaveBeenCalledTimes(1);
  });
});

describe("cancelación con reunión compartida", () => {
  it("cancelar un encuentro con otros encuentros activos no elimina la reunión Zoom", async () => {
    const { repo, finalizadas } = crearRepo({
      eventos: { e1: { reunion: true, operacion: "CANCELAR", externalEventId: "serie-1" } },
      reunion: {
        estadoCreacion: "CREADA",
        externalId: "serie-1",
        usos: [uso("e1", "CANCELADA"), uso("e2"), uso("e3")]
      }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(eliminarReunionZoomHttp).not.toHaveBeenCalled();
    expect(finalizadas).toEqual(["e1"]);
  });

  it("cancelar el último encuentro activo la elimina una sola vez, aunque queden encuentros pasados", async () => {
    const { repo, mocks, reunion } = crearRepo({
      eventos: { e1: { reunion: true, operacion: "CANCELAR", externalEventId: "serie-1" } },
      reunion: {
        estadoCreacion: "CREADA",
        externalId: "serie-1",
        usos: [uso("e1"), uso("e0", "REALIZADA", enHoras(-48)), uso("e9", "CANCELADA")]
      }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(eliminarReunionZoomHttp).toHaveBeenCalledTimes(1);
    expect(eliminarReunionZoomHttp).toHaveBeenCalledWith("tok", "serie-1");
    expect(mocks.marcarReunionCompartidaEliminada).toHaveBeenCalledTimes(1);
    expect(reunion.estadoCreacion).toBe("ELIMINADA");
  });

  it("un reintento de la cancelación no vuelve a eliminar la reunión", async () => {
    const { repo } = crearRepo({
      eventos: { e1: { reunion: true, operacion: "CANCELAR", externalEventId: "serie-1" } },
      reunion: { estadoCreacion: "ELIMINADA", externalId: "serie-1", usos: [uso("e1", "CANCELADA")] }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(eliminarReunionZoomHttp).not.toHaveBeenCalled();
  });

  it("si Zoom ya no tiene la reunión (404) la cancelación igual termina", async () => {
    vi.mocked(eliminarReunionZoomHttp).mockRejectedValueOnce(
      Object.assign(new Error("not found"), { status: 404 })
    );
    const { repo, finalizadas, reunion } = crearRepo({
      eventos: { e1: { reunion: true, operacion: "CANCELAR", externalEventId: "serie-1" } },
      reunion: { estadoCreacion: "CREADA", externalId: "serie-1", usos: [uso("e1")] }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(finalizadas).toEqual(["e1"]);
    expect(reunion.estadoCreacion).toBe("ELIMINADA");
  });

  it("si la eliminación en Zoom falla con otro error no marca la reunión como eliminada", async () => {
    vi.mocked(eliminarReunionZoomHttp).mockRejectedValueOnce(
      new Error("Zoom API error al eliminar (500): boom")
    );
    const { repo, mocks, reunion } = crearRepo({
      eventos: { e1: { reunion: true, operacion: "CANCELAR", externalEventId: "serie-1" } },
      reunion: { estadoCreacion: "CREADA", externalId: "serie-1", usos: [uso("e1")] }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(mocks.registrarErrorReclamado).toHaveBeenCalledTimes(1);
    expect(reunion.estadoCreacion).toBe("CREADA");
  });

  it("un evento sin reunión compartida cancela su propia reunión como hoy", async () => {
    const { repo } = crearRepo({
      eventos: { e1: { reunion: false, operacion: "CANCELAR", externalEventId: "propia-1" } }
    });
    await sincronizarEventosPendientesUseCase(repo, factory, ["e1"]);
    expect(eliminarReunionZoomHttp).toHaveBeenCalledWith("tok", "propia-1");
  });
});
