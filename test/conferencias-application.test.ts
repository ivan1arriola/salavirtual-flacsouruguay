import { describe, expect, it, vi } from "vitest";
import {
  descartarOperacionesNoBloqueantesLoteUseCase,
  descartarOperacionPendienteUseCase,
  reclasificarOperacionesPendientesLoteUseCase,
  sincronizarCohostsExistenteUseCase,
  sincronizarEventosPendientesUseCase,
} from "../src/modules/conferencias/application";
import type {
  ConferenceProvisionRequest,
  ProvisionConferenciaResult,
} from "../src/modules/conferencias/domain";
import type {
  ClaimInfo,
  ConferenceProvider,
  ConferenceProviderFactory,
  ConferenciasRepositoryPort,
  EventoProveedorSnapshot,
} from "../src/modules/conferencias/ports";
import {
  crearReunionZoomHttp,
  actualizarReunionZoomHttp,
  eliminarReunionZoomHttp,
} from "@/src/integrations/zoom/zoom-client";

vi.mock("@/src/integrations/zoom/zoom-client", () => ({
  obtenerZoomAccessToken: vi.fn(async () => "mock-zoom-token"),
  crearReunionZoomHttp: vi.fn(async () => ({
    meetingId: "98765432100",
    joinUrl: "https://zoom.us/j/98765432100",
    startUrl: "https://zoom.us/s/98765432100",
  })),
  actualizarReunionZoomHttp: vi.fn(async () => {}),
  eliminarReunionZoomHttp: vi.fn(async () => {}),
}));

describe("conferencias/application", () => {
  const fakeRequest: ConferenceProvisionRequest = {
    titulo: "Clase Magistral",
    descripcion: "Clase de posgrado",
    inicio: new Date("2026-10-01T14:00:00.000Z"),
    fin: new Date("2026-10-01T16:00:00.000Z"),
    timezone: "America/Montevideo",
    calendarId: "sala01@flacso.edu.uy",
    calendarEventId: "evt-123",
  };

  const createMockRepo = (overrides?: Partial<ConferenciasRepositoryPort>): ConferenciasRepositoryPort => ({
    obtenerSnapshotsEventos: vi.fn(async (ids: readonly string[]) =>
      ids.map((id: string): EventoProveedorSnapshot => ({
        id,
        estadoIntegracion: "PENDIENTE",
        operacionPendiente: "PROVISIONAR",
        reclamoIntegracionAt: null,
        errorIntegracion: null,
      }))
    ),
    obtenerCredencialesWorkspace: vi.fn(async () => ({
      disponible: true,
      serviceAccountEmail: "svc@flacso.iam.gserviceaccount.com",
      privateKey: "pk-123",
    })),
    obtenerCredencialesZoom: vi.fn(async () => ({
      disponible: true,
      accountId: "acc-123",
      clientId: "cli-123",
      clientSecret: "sec-123",
    })),
    reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo | null> => ({
      event: {
        id,
        proveedorTipo: "GOOGLE_MEET",
        externalEventId: null,
        solicitudSalaId: "sol-1",
        organizerEmail: "sala01@flacso.edu.uy",
        request: fakeRequest,
      },
      operacion: "PROVISIONAR",
      at: new Date(),
      token: "tok-1",
    })),
    buscarConferenceDataCompartida: vi.fn(async () => undefined),
    guardarExternalEventIdTemprano: vi.fn(async () => {}),
    persistirMeetDetectado: vi.fn(async () => {}),
    finalizarOperacion: vi.fn(async () => true),
    registrarErrorReclamado: vi.fn(async (claim: ClaimInfo, error: string): Promise<ProvisionConferenciaResult> => ({
      eventoProveedorId: claim.event.id,
      estado: "ERROR",
      error,
    })),
    registrarErrorSinClaim: vi.fn(async (id: string, error: string): Promise<ProvisionConferenciaResult> => ({
      eventoProveedorId: id,
      estado: "ERROR",
      error,
    })),
    obtenerEstadoActual: vi.fn(async (id: string): Promise<ProvisionConferenciaResult> => ({
      eventoProveedorId: id,
      estado: "SINCRONIZADA",
    })),
    descartarOperacionPendiente: vi.fn(async (id: string) => ({
      eventoProveedorId: id,
      descartada: true,
    })),
    descartarOperacionesNoBloqueantesLote: vi.fn(async () => ({
      totalDescartadas: 3,
    })),
    reclasificarOperacionesPendientesLote: vi.fn(async () => ({
      totalReclasificadas: 5,
    })),
    ...overrides,
  });

  const createMockProvider = (overrides?: Partial<ConferenceProvider>): ConferenceProvider => ({
    crearEventoCalendar: vi.fn(async () => ({
      externalEventId: "google-evt-1",
      payload: { id: "google-evt-1" },
    })),
    obtenerEvento: vi.fn(async () => ({
      externalEventId: "google-evt-1",
      codigoReunion: "abc-defg-hij",
      joinUrl: "https://meet.google.com/abc-defg-hij",
      payload: { id: "google-evt-1", conferenceData: { conferenceId: "abc-defg-hij" } },
    })),
    configurarEventoMeet: vi.fn(async () => {}),
    cancelarEvento: vi.fn(async () => {}),
    actualizarEvento: vi.fn(async () => {}),
    sincronizarCohostsExistente: vi.fn(async () => ({ verified: true })),
    ...overrides,
  });

  it("sincronizarEventosPendientesUseCase orquesta provisionamiento con guardado temprano y finalizacion", async () => {
    const repo = createMockRepo();
    const provider = createMockProvider();
    const factory: ConferenceProviderFactory = () => provider;

    const results = await sincronizarEventosPendientesUseCase(repo, factory, ["evt-p-1"]);

    expect(results).toHaveLength(1);
    expect(results[0].estado).toBe("SINCRONIZADA");
    expect(results[0].codigoReunion).toBe("abc-defg-hij");

    expect(repo.reclamarEvento).toHaveBeenCalledWith("evt-p-1");
    expect(provider.crearEventoCalendar).toHaveBeenCalled();
    expect(repo.guardarExternalEventIdTemprano).toHaveBeenCalledWith(expect.objectContaining({ token: "tok-1" }), "google-evt-1", expect.any(Object));
    expect(repo.persistirMeetDetectado).toHaveBeenCalledWith(expect.objectContaining({ token: "tok-1" }), expect.any(Object));
    expect(provider.configurarEventoMeet).toHaveBeenCalled();
    expect(repo.finalizarOperacion).toHaveBeenCalled();
  });

  it("sincronizarEventosPendientesUseCase clasifica errores de scopes como pendientes de configuracion no bloqueantes", async () => {
    const repo = createMockRepo();
    const provider = createMockProvider({
      configurarEventoMeet: vi.fn().mockRejectedValue(
        new Error("403: insufficient authentication scopes on spaces.members")
      ),
    });
    const factory: ConferenceProviderFactory = () => provider;

    await sincronizarEventosPendientesUseCase(repo, factory, ["evt-p-1"]);

    expect(repo.registrarErrorReclamado).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("insufficient authentication scopes"),
      true
    );
  });

  it("sincronizarEventosPendientesUseCase orquesta reprogramacion y verifica coincidencia", async () => {
    const repo = createMockRepo({
      reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo | null> => ({
        event: {
          id,
          proveedorTipo: "GOOGLE_MEET",
          externalEventId: "google-evt-1",
          solicitudSalaId: "sol-1",
          organizerEmail: "sala01@flacso.edu.uy",
          request: fakeRequest,
        },
        operacion: "REPROGRAMAR",
        at: new Date(),
        token: "tok-1",
      })),
    });
    const provider = createMockProvider({
      obtenerEvento: vi.fn(async () => ({
        externalEventId: "google-evt-1",
        codigoReunion: "abc-defg-hij",
        joinUrl: "https://meet.google.com/abc-defg-hij",
        payload: {
          id: "google-evt-1",
          summary: fakeRequest.titulo,
          description: fakeRequest.descripcion,
          start: { dateTime: fakeRequest.inicio.toISOString(), timeZone: fakeRequest.timezone },
          end: { dateTime: fakeRequest.fin.toISOString(), timeZone: fakeRequest.timezone },
        },
      })),
    });
    const factory: ConferenceProviderFactory = () => provider;

    const results = await sincronizarEventosPendientesUseCase(repo, factory, ["evt-reprog-1"]);
    expect(results[0].estado).toBe("SINCRONIZADA");
    expect(provider.actualizarEvento).toHaveBeenCalled();
    expect(repo.persistirMeetDetectado).toHaveBeenCalled();
  });

  it("sincronizarEventosPendientesUseCase orquesta cancelacion exitosa", async () => {
    const repo = createMockRepo({
      reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo | null> => ({
        event: {
          id,
          proveedorTipo: "GOOGLE_MEET",
          externalEventId: "google-evt-1",
          solicitudSalaId: "sol-1",
          organizerEmail: "sala01@flacso.edu.uy",
          request: fakeRequest,
        },
        operacion: "CANCELAR",
        at: new Date(),
        token: "tok-1",
      })),
    });
    const provider = createMockProvider();
    const factory: ConferenceProviderFactory = () => provider;

    const results = await sincronizarEventosPendientesUseCase(repo, factory, ["evt-canc-1"]);
    expect(results[0].estado).toBe("SINCRONIZADA");
    expect(provider.cancelarEvento).toHaveBeenCalledWith("sala01@flacso.edu.uy", "google-evt-1");
  });

  it("sincronizarEventosPendientesUseCase orquesta provisionamiento Zoom exitoso", async () => {
    const repo = createMockRepo({
      reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo | null> => ({
        event: {
          id,
          proveedorTipo: "ZOOM",
          externalEventId: null,
          solicitudSalaId: "sol-1",
          organizerEmail: "zoom01@flacso.edu.uy",
          request: fakeRequest,
        },
        operacion: "PROVISIONAR",
        at: new Date(),
        token: "tok-1",
      })),
    });
    const factory: ConferenceProviderFactory = () => createMockProvider();

    const results = await sincronizarEventosPendientesUseCase(repo, factory, ["evt-zoom-1"]);
    expect(results[0].estado).toBe("SINCRONIZADA");
    expect(results[0].codigoReunion).toBe("98765432100");
    expect(crearReunionZoomHttp).toHaveBeenCalled();
    expect(repo.guardarExternalEventIdTemprano).toHaveBeenCalledWith(
      expect.anything(),
      "98765432100",
      expect.anything()
    );
    expect(repo.persistirMeetDetectado).toHaveBeenCalled();
    expect(repo.finalizarOperacion).toHaveBeenCalled();
  });

  it("sincronizarEventosPendientesUseCase orquesta reprogramacion Zoom exitosa", async () => {
    const repo = createMockRepo({
      reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo | null> => ({
        event: {
          id,
          proveedorTipo: "ZOOM",
          externalEventId: "98765432100",
          solicitudSalaId: "sol-1",
          organizerEmail: "zoom01@flacso.edu.uy",
          request: fakeRequest,
        },
        operacion: "REPROGRAMAR",
        at: new Date(),
        token: "tok-1",
      })),
    });
    const factory: ConferenceProviderFactory = () => createMockProvider();

    const results = await sincronizarEventosPendientesUseCase(repo, factory, ["evt-zoom-reprog"]);
    expect(results[0].estado).toBe("SINCRONIZADA");
    expect(actualizarReunionZoomHttp).toHaveBeenCalledWith(
      "mock-zoom-token",
      "98765432100",
      expect.objectContaining({ topic: fakeRequest.titulo })
    );
    expect(repo.finalizarOperacion).toHaveBeenCalled();
  });

  it("sincronizarEventosPendientesUseCase orquesta cancelacion Zoom exitosa", async () => {
    const repo = createMockRepo({
      reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo | null> => ({
        event: {
          id,
          proveedorTipo: "ZOOM",
          externalEventId: "98765432100",
          solicitudSalaId: "sol-1",
          organizerEmail: "zoom01@flacso.edu.uy",
          request: fakeRequest,
        },
        operacion: "CANCELAR",
        at: new Date(),
        token: "tok-1",
      })),
    });
    const factory: ConferenceProviderFactory = () => createMockProvider();

    const results = await sincronizarEventosPendientesUseCase(repo, factory, ["evt-zoom-canc"]);
    expect(results[0].estado).toBe("SINCRONIZADA");
    expect(eliminarReunionZoomHttp).toHaveBeenCalledWith("mock-zoom-token", "98765432100");
    expect(repo.finalizarOperacion).toHaveBeenCalled();
  });

  it("sincronizarEventosPendientesUseCase reporta error claro cuando faltan credenciales Zoom", async () => {
    const repo = createMockRepo({
      obtenerCredencialesZoom: vi.fn(async () => ({ disponible: false })),
      reclamarEvento: vi.fn(async (id: string): Promise<ClaimInfo | null> => ({
        event: {
          id,
          proveedorTipo: "ZOOM",
          externalEventId: null,
          solicitudSalaId: "sol-1",
          organizerEmail: "zoom01@flacso.edu.uy",
          request: fakeRequest,
        },
        operacion: "PROVISIONAR",
        at: new Date(),
        token: "tok-1",
      })),
    });
    const factory: ConferenceProviderFactory = () => createMockProvider();

    await sincronizarEventosPendientesUseCase(repo, factory, ["evt-zoom-nocreds"]);
    expect(repo.registrarErrorReclamado).toHaveBeenCalledWith(
      expect.anything(),
      expect.stringContaining("Credenciales de Zoom Server-to-Server OAuth no configuradas")
    );
  });

  it("descartarOperacionPendienteUseCase y lote delegan en el repositorio", async () => {
    const repo = createMockRepo();
    const single = await descartarOperacionPendienteUseCase(repo, "evt-1");
    expect(single.descartada).toBe(true);
    expect(repo.descartarOperacionPendiente).toHaveBeenCalledWith("evt-1");

    const lote = await descartarOperacionesNoBloqueantesLoteUseCase(repo);
    expect(lote.totalDescartadas).toBe(3);
    expect(repo.descartarOperacionesNoBloqueantesLote).toHaveBeenCalled();

    const reclasificado = await reclasificarOperacionesPendientesLoteUseCase(repo);
    expect(reclasificado.totalReclasificadas).toBe(5);
    expect(repo.reclasificarOperacionesPendientesLote).toHaveBeenCalled();
  });

  it("sincronizarCohostsExistenteUseCase delega en el provider obtenido", async () => {
    const repo = createMockRepo();
    const provider = createMockProvider();
    const factory: ConferenceProviderFactory = () => provider;

    const res = await sincronizarCohostsExistenteUseCase(repo, factory, {
      organizerEmail: "sala01@flacso.edu.uy",
      calendarId: "sala01@flacso.edu.uy",
      externalEventId: "google-evt-1",
      cohostsAnteriores: [],
      cohostsDeseados: ["docente@flacso.edu.uy"],
    });

    expect(res).toEqual({ verified: true });
    expect(provider.sincronizarCohostsExistente).toHaveBeenCalled();
  });
});

