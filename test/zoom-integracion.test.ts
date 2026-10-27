import { describe, expect, it, vi } from "vitest";
import {
  crearZoomClient,
  codificarUuidZoom,
  cuerpoReunionZoom,
  limpiarCacheTokensZoom,
  ZoomApiError,
  type ZoomFetch,
} from "../src/integrations/zoom";
import {
  crearZoomConferenceProvider,
  separarAlternativeHosts,
} from "../src/modules/conferencias/infrastructure/zoom/zoom-conference-provider.adapter";
import { sincronizarEventosPendientesUseCase } from "../src/modules/conferencias/application";
import type {
  ConferenceProvisionRequest,
  ConferenceProvisionResult,
  ProvisionConferenciaResult,
} from "../src/modules/conferencias/domain";
import {
  esProveedorOperativo,
  etiquetaProveedor,
  FILTRO_PROVEEDOR_OPERATIVO,
} from "../src/modules/conferencias/domain";
import type {
  ClaimInfo,
  ConferenciasRepositoryPort,
  ZoomConferenceProvider,
} from "../src/modules/conferencias/ports";
import {
  artefactosDesdeGrabacionesZoom,
  elegirInstanciaZoom,
  participantesDesdeSesionesZoom,
  sesionesDesdeReporteZoom,
} from "../src/modules/archivos/domain";

const CREDENCIALES = { accountId: "acc-1234567890", clientId: "cli-1234567890", clientSecret: "secreto" };

function respuesta(status: number, body: unknown, headers: Record<string, string> = {}): Response {
  return new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

function fetchFalso(rutas: (url: string, init?: RequestInit) => Response | undefined) {
  const llamadas: { url: string; method: string; body?: unknown }[] = [];
  const fetchFn: ZoomFetch = async (url, init) => {
    if (url.startsWith("https://zoom.us/oauth/token")) {
      return respuesta(200, { access_token: "tok", expires_in: 3600 });
    }
    llamadas.push({
      url,
      method: init?.method ?? "GET",
      body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
    });
    return rutas(url, init) ?? respuesta(404, { code: 3001, message: "Meeting does not exist" });
  };
  return { fetchFn, llamadas };
}

describe("proveedores operativos", () => {
  it("incluye Meet y Zoom y deja afuera el histórico", () => {
    expect(esProveedorOperativo("GOOGLE_MEET")).toBe(true);
    expect(esProveedorOperativo("ZOOM")).toBe(true);
    expect(esProveedorOperativo("ZOOM_HISTORICO")).toBe(false);
    expect(FILTRO_PROVEEDOR_OPERATIVO.tipo.in).toEqual(["GOOGLE_MEET", "ZOOM"]);
    expect(etiquetaProveedor("ZOOM")).toBe("Zoom");
    expect(etiquetaProveedor("GOOGLE_MEET")).toBe("Google Meet");
  });
});

describe("cliente HTTP de Zoom", () => {
  it("arma una reunión programada en UTC con grabación en la nube", () => {
    const body = cuerpoReunionZoom({
      topic: "Curso básico",
      inicio: new Date("2026-11-03T21:00:00.000Z"),
      fin: new Date("2026-11-03T23:30:00.000Z"),
      timezone: "America/Montevideo",
      alternativeHosts: ["a@flacso.edu.uy", "b@flacso.edu.uy"],
      grabarEnNube: true,
    });
    expect(body).toMatchObject({
      type: 2,
      start_time: "2026-11-03T21:00:00Z",
      duration: 150,
      timezone: "America/Montevideo",
      settings: { alternative_hosts: "a@flacso.edu.uy;b@flacso.edu.uy", auto_recording: "cloud" },
    });
  });

  it("codifica dos veces los UUID con barras", () => {
    expect(codificarUuidZoom("abc==")).toBe("abc%3D%3D");
    expect(codificarUuidZoom("/ab//c==")).toBe(encodeURIComponent(encodeURIComponent("/ab//c==")));
  });

  it("reintenta lecturas ante 429 y nunca reintenta un POST", async () => {
    limpiarCacheTokensZoom();
    let intentosGet = 0;
    let intentosPost = 0;
    const { fetchFn } = fetchFalso((url, init) => {
      if ((init?.method ?? "GET") === "GET") {
        intentosGet += 1;
        return intentosGet === 1 ? respuesta(429, { message: "rate" }) : respuesta(200, { ok: true });
      }
      intentosPost += 1;
      return respuesta(500, { message: "boom" });
    });
    const client = crearZoomClient(CREDENCIALES, { fetch: fetchFn, esperar: async () => {} });
    await expect(client.get("/users/me")).resolves.toEqual({ ok: true });
    expect(intentosGet).toBe(2);
    await expect(client.post("/users/me/meetings", {})).rejects.toBeInstanceOf(ZoomApiError);
    expect(intentosPost).toBe(1);
  });
});

describe("aprovisionamiento Zoom", () => {
  const request: ConferenceProvisionRequest = {
    titulo: "Proyecto MIEM",
    inicio: new Date("2026-11-03T21:00:00.000Z"),
    fin: new Date("2026-11-03T23:00:00.000Z"),
    timezone: "America/Montevideo",
    calendarId: "sala.zoom@flacso.edu.uy",
    cohostEmails: ["docente@flacso.edu.uy", "externo@gmail.com", "sala.zoom@flacso.edu.uy"],
    guestEmails: ["invitada@flacso.edu.uy"],
    requiereGrabacion: true,
    calendarEventId: "a1",
  };

  it("solo aplica como alternative hosts a usuarios de la cuenta y excluye al host", () => {
    expect(separarAlternativeHosts(
      ["Docente@flacso.edu.uy", "externo@gmail.com", "sala.zoom@flacso.edu.uy"],
      "sala.zoom@flacso.edu.uy",
      ["docente@flacso.edu.uy", "sala.zoom@flacso.edu.uy"]
    )).toEqual({ aplicados: ["docente@flacso.edu.uy"], rechazados: ["externo@gmail.com"] });
  });

  it("crea la reunión sin cohosts y los configura después", async () => {
    limpiarCacheTokensZoom();
    const { fetchFn, llamadas } = fetchFalso((url, init) => {
      const method = init?.method ?? "GET";
      if (method === "POST" && url.endsWith("/users/sala.zoom%40flacso.edu.uy/meetings")) {
        return respuesta(201, { id: 85012345678, join_url: "https://zoom.us/j/85012345678", settings: {} });
      }
      if (method === "GET" && url.includes("/users?")) {
        return respuesta(200, { users: [{ id: "u1", email: "docente@flacso.edu.uy", type: 2 }] });
      }
      if (method === "PATCH") return respuesta(204, undefined);
      return undefined;
    });
    const provider = crearZoomConferenceProvider(CREDENCIALES, { fetch: fetchFn });
    const created = await provider.crearReunion("sala.zoom@flacso.edu.uy", request);
    expect(created.externalEventId).toBe("85012345678");
    const post = llamadas.find(({ method }) => method === "POST");
    expect((post?.body as { settings: { alternative_hosts: string } }).settings.alternative_hosts).toBe("");

    const cohosts = await provider.configurarCohosts("85012345678", "sala.zoom@flacso.edu.uy", request.cohostEmails!);
    expect(cohosts).toEqual({ aplicados: ["docente@flacso.edu.uy"], rechazados: ["externo@gmail.com"] });
    const patch = llamadas.find(({ method }) => method === "PATCH");
    expect(patch?.body).toEqual({
      settings: { alternative_hosts: "docente@flacso.edu.uy", alternative_hosts_email_notification: true },
    });
  });

  it("tolera borrar una reunión que ya no existe en Zoom", async () => {
    limpiarCacheTokensZoom();
    const { fetchFn } = fetchFalso(() => undefined);
    const provider = crearZoomConferenceProvider(CREDENCIALES, { fetch: fetchFn });
    await expect(provider.cancelarReunion("999")).resolves.toBeUndefined();
    await expect(provider.obtenerReunion("999")).resolves.toBeNull();
  });

  function repositorio(operacion: ClaimInfo["operacion"], externalEventId: string | null) {
    const finalizados: (ConferenceProvisionResult | null)[] = [];
    const tempranos: string[] = [];
    const repo: ConferenciasRepositoryPort = {
      obtenerSnapshotsEventos: vi.fn(async (ids: readonly string[]) => ids.map((id) => ({
        id,
        tipoProveedor: id.startsWith("zoom") ? "ZOOM" as const : "GOOGLE_MEET" as const,
        estadoIntegracion: "PENDIENTE" as const,
        operacionPendiente: operacion,
        reclamoIntegracionAt: null,
        errorIntegracion: null,
      }))),
      obtenerCredencialesWorkspace: vi.fn(async () => ({ disponible: false })),
      obtenerCredencialesZoom: vi.fn(async () => ({ disponible: true, credentials: CREDENCIALES })),
      reclamarEvento: vi.fn(async (id: string) => ({
        event: {
          id,
          tipoProveedor: "ZOOM" as const,
          externalEventId,
          solicitudSalaId: "sol-1",
          organizerEmail: "sala.zoom@flacso.edu.uy",
          request,
        },
        operacion,
        at: new Date(),
        token: "t",
      })),
      buscarConferenceDataCompartida: vi.fn(async () => undefined),
      guardarExternalEventIdTemprano: vi.fn(async (_claim: ClaimInfo, id: string) => { tempranos.push(id); }),
      persistirMeetDetectado: vi.fn(async () => {}),
      finalizarOperacion: vi.fn(async (_claim: ClaimInfo, result: ConferenceProvisionResult | null) => {
        finalizados.push(result);
        return true;
      }),
      registrarErrorReclamado: vi.fn(async (claim: ClaimInfo, error: string): Promise<ProvisionConferenciaResult> => ({
        eventoProveedorId: claim.event.id, estado: "ERROR", error,
      })),
      registrarErrorSinClaim: vi.fn(async (id: string, error: string): Promise<ProvisionConferenciaResult> => ({
        eventoProveedorId: id, estado: "ERROR", error,
      })),
      obtenerEstadoActual: vi.fn(async (id: string): Promise<ProvisionConferenciaResult> => ({
        eventoProveedorId: id, estado: "SINCRONIZADA",
      })),
      descartarOperacionPendiente: vi.fn(async (id: string) => ({ eventoProveedorId: id, descartada: true })),
      descartarOperacionesNoBloqueantesLote: vi.fn(async () => ({ totalDescartadas: 0 })),
    };
    return { repo, finalizados, tempranos };
  }

  function proveedorFalso(): ZoomConferenceProvider & { creadas: number } {
    const provider = {
      creadas: 0,
      crearReunion: vi.fn(async () => {
        provider.creadas += 1;
        return { externalEventId: "850", payload: { zoom: { id: 850 } } };
      }),
      obtenerReunion: vi.fn(async (id: string) => ({
        externalEventId: id, codigoReunion: id, joinUrl: `https://zoom.us/j/${id}`, payload: { zoom: { id } },
      })),
      actualizarReunion: vi.fn(async () => {}),
      configurarCohosts: vi.fn(async () => ({ aplicados: ["docente@flacso.edu.uy"], rechazados: ["externo@gmail.com"] })),
      cancelarReunion: vi.fn(async () => {}),
    };
    return provider;
  }

  it("provisiona eventos Zoom sin tocar el proveedor de Google", async () => {
    const { repo, finalizados, tempranos } = repositorio("PROVISIONAR", null);
    const zoom = proveedorFalso();
    const google = vi.fn();
    const results = await sincronizarEventosPendientesUseCase(repo, google, ["zoom-1"], () => zoom);

    expect(google).not.toHaveBeenCalled();
    expect(results).toEqual([{ eventoProveedorId: "zoom-1", estado: "SINCRONIZADA", codigoReunion: "850" }]);
    expect(tempranos).toEqual(["850"]);
    const payload = finalizados[0]?.payload as {
      salaVirtual: { cohostVerification: { emails: string[] }; zoomCohostsFueraDeCuenta: string[]; invitadosEmails: string[] };
    };
    expect(payload.salaVirtual.cohostVerification.emails).toEqual(["docente@flacso.edu.uy"]);
    expect(payload.salaVirtual.zoomCohostsFueraDeCuenta).toEqual(["externo@gmail.com"]);
    expect(payload.salaVirtual.invitadosEmails).toEqual(["invitada@flacso.edu.uy"]);
  });

  it("no repite el POST cuando el meeting ID ya está guardado", async () => {
    const { repo } = repositorio("PROVISIONAR", "850");
    const zoom = proveedorFalso();
    await sincronizarEventosPendientesUseCase(repo, vi.fn(), ["zoom-1"], () => zoom);
    expect(zoom.creadas).toBe(0);
    expect(zoom.configurarCohosts).toHaveBeenCalled();
  });

  it("reprograma y cancela usando la operación persistida", async () => {
    const reprogramar = repositorio("REPROGRAMAR", "850");
    const zoomA = proveedorFalso();
    await sincronizarEventosPendientesUseCase(reprogramar.repo, vi.fn(), ["zoom-1"], () => zoomA);
    expect(zoomA.actualizarReunion).toHaveBeenCalledWith("850", request);

    const cancelar = repositorio("CANCELAR", "850");
    const zoomB = proveedorFalso();
    const [result] = await sincronizarEventosPendientesUseCase(cancelar.repo, vi.fn(), ["zoom-1"], () => zoomB);
    expect(zoomB.cancelarReunion).toHaveBeenCalledWith("850");
    expect(result?.estado).toBe("SINCRONIZADA");
  });

  it("deja Zoom pendiente de configuración si no hay credenciales", async () => {
    const { repo } = repositorio("PROVISIONAR", null);
    const sinCredenciales: ConferenciasRepositoryPort = {
      ...repo,
      obtenerCredencialesZoom: vi.fn(async () => ({ disponible: false })),
    };
    const results = await sincronizarEventosPendientesUseCase(sinCredenciales, vi.fn(), ["zoom-1"], () => proveedorFalso());
    expect(results).toEqual([{ eventoProveedorId: "zoom-1", estado: "PENDIENTE_CONFIGURACION" }]);
  });
});

describe("asistencia y grabaciones Zoom", () => {
  const inicio = new Date("2026-11-03T21:00:00.000Z");
  const fin = new Date("2026-11-03T23:00:00.000Z");

  it("elige la instancia de la reunión que coincide con el encuentro", () => {
    expect(elegirInstanciaZoom([
      { uuid: "semana-anterior", start_time: "2026-10-27T21:00:00Z" },
      { uuid: "hoy", start_time: "2026-11-03T20:55:00Z" },
    ], inicio, fin)?.name).toBe("hoy");
    expect(elegirInstanciaZoom([{ uuid: "otra-semana", start_time: "2026-10-27T21:00:00Z" }], inicio, fin)).toBeNull();
  });

  it("convierte el reporte de participantes en sesiones con correo verificado", () => {
    const sesiones = sesionesDesdeReporteZoom("uuid-1", [
      { name: "Ana", user_email: "Ana@Flacso.edu.uy", join_time: "2026-11-03T21:00:00Z", leave_time: "2026-11-03T22:00:00Z" },
      { name: "Ana", user_email: "ana@flacso.edu.uy", join_time: "2026-11-03T22:05:00Z", leave_time: "2026-11-03T23:00:00Z" },
      { name: "Invitado", join_time: "2026-11-03T21:10:00Z", leave_time: "2026-11-03T21:40:00Z", participant_user_id: "p9" },
      { name: "Roto", join_time: "sin fecha", leave_time: "2026-11-03T21:40:00Z" },
    ]);
    expect(sesiones).toHaveLength(3);
    expect(sesiones[0]).toMatchObject({ correoVerificado: "ana@flacso.edu.uy", participanteId: "email:ana@flacso.edu.uy" });
    expect(sesiones[1]?.participanteId).toBe(sesiones[0]?.participanteId);
    expect(sesiones[2]).toMatchObject({ participanteId: "zoom:p9", tipo: "INVITADO_ZOOM" });
  });

  it("resume participantes para la consola fusionando reconexiones", () => {
    const scan = participantesDesdeSesionesZoom("uuid-1", [
      { clave: "email:ana@flacso.edu.uy", nombre: "Ana", email: "ana@flacso.edu.uy", inicio: "2026-11-03T21:00:00Z", fin: "2026-11-03T22:00:00Z" },
      { clave: "email:ana@flacso.edu.uy", nombre: "Ana", email: "ana@flacso.edu.uy", inicio: "2026-11-03T21:30:00Z", fin: "2026-11-03T22:30:00Z" },
      { clave: "zoom:p9", nombre: "Invitado", inicio: "2026-11-03T22:00:00Z" },
    ], new Date("2026-11-03T22:40:00Z"));
    expect(scan.participantesActivos.map(({ nombre }) => nombre)).toEqual(["Invitado"]);
    const ana = scan.participantesDesconectados?.[0];
    expect(ana).toMatchObject({ nombre: "Ana", minutosConectado: 90, numeroConexiones: 2, conectado: false });
  });

  it("conserva una vista por segmento de grabación y las transcripciones", () => {
    const scan = artefactosDesdeGrabacionesZoom("uuid-1", [
      { id: "g1", file_type: "MP4", recording_type: "gallery_view", recording_start: "2026-11-03T21:00:00Z", download_url: "https://zoom/g1", status: "completed", file_size: 10 },
      { id: "s1", file_type: "MP4", recording_type: "shared_screen_with_speaker_view", recording_start: "2026-11-03T21:00:00Z", download_url: "https://zoom/s1", status: "completed", file_size: 20 },
      { id: "t1", file_type: "TRANSCRIPT", download_url: "https://zoom/t1", status: "completed" },
      { id: "c1", file_type: "CHAT", download_url: "https://zoom/c1", status: "completed" },
    ]);
    expect(scan.recordings).toHaveLength(1);
    expect(scan.recordings[0]).toMatchObject({ resourceName: "zoom/uuid-1/recording/s1", downloadUrl: "https://zoom/s1", extension: "mp4" });
    expect(scan.transcripts).toHaveLength(1);
    expect(scan.estadoGrabacion).toBe("GENERADA");
    expect(scan.pendientes).toBe(0);
  });

  it("informa grabación en proceso mientras Zoom la genera", () => {
    const scan = artefactosDesdeGrabacionesZoom("uuid-1", [
      { id: "s1", file_type: "MP4", download_url: "https://zoom/s1", status: "processing" },
    ]);
    expect(scan.recordings).toHaveLength(0);
    expect(scan.estadoGrabacion).toBe("PROCESANDO");
    expect(scan.pendientes).toBe(1);
  });
});
