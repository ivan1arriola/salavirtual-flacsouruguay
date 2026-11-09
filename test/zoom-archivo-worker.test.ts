import { describe, expect, it, vi } from "vitest";
import { proximoIntentoZoom } from "../src/modules/archivos/domain/zoom-backoff.domain";
import { transferirArchivoZoomUseCase } from "../src/modules/archivos/application/transferir-archivo-zoom.use-case";
import { procesarColaZoomUseCase } from "../src/modules/archivos/application/procesar-cola-zoom.use-case";
import type { ArchivoReclamadoZoom } from "../src/modules/archivos/ports";

const KIB = 256 * 1024;
const GB = 1024n ** 3n;
const AHORA = new Date("2026-11-09T12:00:00Z");
const LEASE = { archivoId: "a1", version: 1, venceAt: new Date(AHORA.getTime() + 300_000) };
const LIMITES = { topeBytes: 80n * GB, reservaRecienteBytes: 20n * GB, ventanaMs: 24 * 3600_000 };

function reclamado(extra: Partial<ArchivoReclamadoZoom> = {}): ArchivoReclamadoZoom {
  return {
    lease: LEASE, ocurrenciaId: "o1",
    ocurrencia: { cuentaZoomId: "c", uuid: "u", meetingId: "1", anfitrionZoomId: "h", inicioRealAt: new Date("2026-11-09T10:00:00Z"), titulo: "Clase" },
    eventoProveedorId: "e1", driveFolderId: "carpeta",
    recurso: { claveOrigen: "k".repeat(64), archivoZoomId: "z1", coleccion: "recording_files", tipoOriginal: "MP4", variante: null, extension: "mp4", inicioAt: null, finAt: null, tamanoBytes: BigInt(2 * KIB), estadoOrigen: "completed", descargable: true },
    nombreDestino: "a.mp4", driveFileId: null, uploadSessionCifrada: null, bytesConfirmados: 0n, intentos: 0,
    ...extra
  };
}

async function* bytes(total: number) { if (total > 0) yield new Uint8Array(total); }

/* eslint-disable @typescript-eslint/no-explicit-any */
function repoFalso(archivo: ArchivoReclamadoZoom | null, sobre: Record<string, unknown> = {}) {
  return {
    obtenerArchivoReclamado: vi.fn(async (..._a: any[]) => archivo),
    guardarProgreso: vi.fn(async (..._a: any[]) => true),
    confirmarConservado: vi.fn(async (..._a: any[]) => true),
    registrarFallo: vi.fn(async (..._a: any[]) => true),
    reservarTransferencia: vi.fn(async (_l: any, s: any, ..._r: any[]) => ({ tipo: "RESERVADA", reservaId: "r1", bytesReservados: s.bytes })),
    liberarReserva: vi.fn(async (..._a: any[]) => true),
    ...sobre
  };
}

function storageFalso(sobre: Record<string, unknown> = {}) {
  return {
    generarId: vi.fn(async (..._a: any[]) => "drive-id"),
    asegurarCarpeta: vi.fn(),
    iniciarSubida: vi.fn(async (..._a: any[]) => "sesion-cifrada"),
    consultarSubida: vi.fn(async (..._a: any[]) => ({ estado: "PARCIAL", bytesConfirmados: 0n })),
    subirBloque: vi.fn(async (_s: string, offset: bigint, b: Uint8Array, _t: unknown, o?: { ultimo?: boolean }) =>
      o?.ultimo
        ? { estado: "COMPLETA", destino: { id: "drive-id", nombre: "a.mp4", tamanoBytes: offset + BigInt(b.byteLength), mimeType: "video/mp4", webViewUrl: null } }
        : { estado: "PARCIAL", bytesConfirmados: offset + BigInt(b.byteLength) }),
    buscarConservado: vi.fn(async (..._a: any[]) => ({ tipo: "NINGUNO" })),
    verificarArchivo: vi.fn(async (id: string) => ({ id, nombre: "a.mp4", tamanoBytes: BigInt(2 * KIB), mimeType: "video/mp4", webViewUrl: null })),
    ...sobre
  };
}

function origenFalso(sobre: Record<string, unknown> = {}) {
  return {
    abrirDescarga: vi.fn(async (_o, _r, offset: bigint) => ({ tipo: "CONTENIDO", contenido: bytes(2 * KIB - Number(offset)), offsetOrigen: offset, totalBytes: BigInt(2 * KIB) })),
    ...sobre
  };
}

function ejecutar(repo: ReturnType<typeof repoFalso>, origen: unknown, storage: unknown, extra: Record<string, unknown> = {}) {
  return transferirArchivoZoomUseCase(
    repo as never, origen as never, storage as never, LEASE, new AbortController().signal,
    { ahora: () => AHORA, limites: LIMITES, bloqueBytes: KIB, aleatorio: () => 0.5, heartbeatMs: 1_000_000, leaseMs: 300_000, ...extra } as never
  );
}

describe("proximoIntentoZoom", () => {
  it("sigue 1 min, 5 min, 15 min, 1 h y se detiene en 6 h con jitter acotado", () => {
    const m = (n: number) => proximoIntentoZoom(n, AHORA, () => 0.5).getTime() - AHORA.getTime();
    expect([1, 2, 3, 4, 5, 6, 50].map(m)).toEqual([60_000, 300_000, 900_000, 3_600_000, 21_600_000, 21_600_000, 21_600_000]);
    expect(proximoIntentoZoom(1, AHORA, () => 1).getTime() - AHORA.getTime()).toBe(72_000);
    expect(proximoIntentoZoom(5, AHORA, () => 1).getTime() - AHORA.getTime()).toBe(21_600_000);
  });
  it("Retry-After solo alarga la espera", () => {
    expect(proximoIntentoZoom(1, AHORA, () => 0.5, 600).getTime() - AHORA.getTime()).toBe(600_000);
    expect(proximoIntentoZoom(3, AHORA, () => 0.5, 5).getTime() - AHORA.getTime()).toBe(900_000);
  });
});

describe("transferirArchivoZoomUseCase", () => {
  it("camino feliz: persiste el ID de Drive antes del POST, sube, confirma y ajusta la reserva", async () => {
    const repo = repoFalso(reclamado());
    const storage = storageFalso();
    const r = await ejecutar(repo, origenFalso(), storage);
    expect(r.tipo).toBe("CONSERVADO");
    const ordenId = repo.guardarProgreso.mock.invocationCallOrder[0]!;
    expect(repo.guardarProgreso.mock.calls[0]![1]).toMatchObject({ driveFileId: "drive-id" });
    expect(ordenId).toBeLessThan(storage.iniciarSubida.mock.invocationCallOrder[0]!);
    expect(repo.confirmarConservado).toHaveBeenCalledTimes(1);
    expect(repo.liberarReserva).toHaveBeenCalledWith("r1", BigInt(2 * KIB), AHORA);
  });

  it("caída después de subir y antes de la DB: reconcilia el mismo destino sin transferir de nuevo", async () => {
    const repo = repoFalso(reclamado({ driveFileId: "drive-id" }));
    const storage = storageFalso({ buscarConservado: vi.fn(async (..._a: any[]) => ({ tipo: "UNO", destino: { id: "drive-id", nombre: "a.mp4", tamanoBytes: BigInt(2 * KIB), mimeType: null, webViewUrl: null } })) });
    const origen = origenFalso();
    const r = await ejecutar(repo, origen, storage);
    expect(r.tipo).toBe("CONSERVADO");
    expect(origen.abrirDescarga).not.toHaveBeenCalled();
    expect(storage.iniciarSubida).not.toHaveBeenCalled();
    expect(repo.confirmarConservado).toHaveBeenCalledTimes(1);
  });

  it("varios recursos con la misma marca: REQUIERE_REVISION, nunca elige uno", async () => {
    const repo = repoFalso(reclamado());
    const r = await ejecutar(repo, origenFalso(), storageFalso({ buscarConservado: vi.fn(async (..._a: any[]) => ({ tipo: "AMBIGUO", cantidad: 2 })) }));
    expect(r.tipo).toBe("FALLO");
    expect(repo.registrarFallo.mock.calls[0]![1]).toMatchObject({ tipo: "REVISION", codigo: "DESTINO_AMBIGUO" });
    expect(repo.confirmarConservado).not.toHaveBeenCalled();
  });

  it("reanuda desde el offset confirmado por Drive, no desde el guardado localmente", async () => {
    const repo = repoFalso(reclamado({ driveFileId: "drive-id", uploadSessionCifrada: "s", bytesConfirmados: 0n }));
    const storage = storageFalso({ consultarSubida: vi.fn(async (..._a: any[]) => ({ estado: "PARCIAL", bytesConfirmados: BigInt(KIB) })) });
    const origen = origenFalso();
    await ejecutar(repo, origen, storage);
    expect(origen.abrirDescarga.mock.calls[0]![2]).toBe(BigInt(KIB));
    expect(storage.iniciarSubida).not.toHaveBeenCalled();
    expect(storage.subirBloque.mock.calls[0]![1]).toBe(BigInt(KIB));
  });

  it("sesión vencida: reinicia desde cero con una sesión nueva", async () => {
    const repo = repoFalso(reclamado({ driveFileId: "drive-id", uploadSessionCifrada: "vieja", bytesConfirmados: BigInt(KIB) }));
    const storage = storageFalso({ consultarSubida: vi.fn(async (..._a: any[]) => ({ estado: "VENCIDA" })) });
    const origen = origenFalso();
    const r = await ejecutar(repo, origen, storage);
    expect(r.tipo).toBe("CONSERVADO");
    expect(storage.iniciarSubida).toHaveBeenCalledTimes(1);
    expect(origen.abrirDescarga.mock.calls[0]![2]).toBe(0n);
  });

  it("sin cupo: vuelve a PENDIENTE como ESPERA/TOPE_DIARIO sin consumir intentos y sin tocar Drive", async () => {
    const liberacion = new Date(AHORA.getTime() + 3600_000);
    const repo = repoFalso(reclamado(), { reservarTransferencia: vi.fn(async (..._a: any[]) => ({ tipo: "SIN_CUPO", disponibleBytes: 0n, liberacionEstimadaAt: liberacion })) });
    const storage = storageFalso();
    const r = await ejecutar(repo, origenFalso(), storage);
    expect(r.tipo).toBe("ESPERA");
    expect(repo.registrarFallo.mock.calls[0]![1]).toMatchObject({ tipo: "ESPERA", codigo: "TOPE_DIARIO", proximoIntentoAt: liberacion });
    expect(storage.generarId).not.toHaveBeenCalled();
  });

  it("tamaño desconocido reserva 50 GB; recientes y históricos piden su prioridad", async () => {
    const reciente = repoFalso(reclamado({ recurso: { ...reclamado().recurso, tamanoBytes: null } }));
    await ejecutar(reciente, origenFalso(), storageFalso());
    expect(reciente.reservarTransferencia.mock.calls[0]![1]).toMatchObject({ bytes: 50n * GB, prioridad: "RECIENTE" });
    const historico = repoFalso(reclamado({ ocurrencia: { ...reclamado().ocurrencia, inicioRealAt: new Date("2026-01-01T00:00:00Z") } }));
    await ejecutar(historico, origenFalso(), storageFalso());
    expect(historico.reservarTransferencia.mock.calls[0]![1]).toMatchObject({ prioridad: "HISTORICO" });
  });

  it("reanudar solo reserva lo que falta", async () => {
    const repo = repoFalso(reclamado({ driveFileId: "d", uploadSessionCifrada: "s" }));
    const storage = storageFalso({ consultarSubida: vi.fn(async (..._a: any[]) => ({ estado: "PARCIAL", bytesConfirmados: BigInt(KIB) })) });
    await ejecutar(repo, origenFalso(), storage);
    expect(repo.reservarTransferencia.mock.calls[0]![1]).toMatchObject({ bytes: BigInt(KIB) });
  });

  it("Drive caído: error reintentable con backoff persistente y la reserva se ajusta a lo transferido", async () => {
    const repo = repoFalso(reclamado({ intentos: 2 }));
    const storage = storageFalso({ iniciarSubida: vi.fn(async (..._a: any[]) => { throw new Error("ECONNRESET https://secreto?token=1"); }) });
    const r = await ejecutar(repo, origenFalso(), storage);
    expect(r.tipo).toBe("FALLO");
    const fallo = repo.registrarFallo.mock.calls[0]![1] as { tipo: string; proximoIntentoAt: Date; limiteIntentos: number; detalle: string };
    expect(fallo.tipo).toBe("REINTENTABLE");
    expect(fallo.proximoIntentoAt.getTime() - AHORA.getTime()).toBe(900_000); // 3er fallo = 15 min
    expect(fallo.limiteIntentos).toBe(10);
    expect(fallo.detalle ?? "").not.toContain("secreto");
    expect(repo.liberarReserva).toHaveBeenCalledWith("r1", 0n, AHORA);
  });

  it("429 de Zoom respeta Retry-After mayor", async () => {
    const repo = repoFalso(reclamado());
    const err = Object.assign(new Error("Zoom: RATE_LIMIT"), { name: "ZoomApiError", code: "RATE_LIMIT", reintentarEnSegundos: 7200 });
    await ejecutar(repo, origenFalso({ abrirDescarga: vi.fn(async (..._a: any[]) => { throw err; }) }), storageFalso());
    const fallo = repo.registrarFallo.mock.calls[0]![1] as { proximoIntentoAt: Date };
    expect(fallo.proximoIntentoAt.getTime() - AHORA.getTime()).toBe(7_200_000);
  });

  it("Zoom ignora Range con descarte excesivo: REQUIERE_REVISION sin repetir descargas", async () => {
    const repo = repoFalso(reclamado({ driveFileId: "d", uploadSessionCifrada: "s" }));
    const storage = storageFalso({ consultarSubida: vi.fn(async (..._a: any[]) => ({ estado: "PARCIAL", bytesConfirmados: BigInt(KIB) })) });
    const origen = origenFalso({ abrirDescarga: vi.fn(async (..._a: any[]) => ({ tipo: "REQUIERE_REVISION", motivo: "RANGE_IGNORADO_DESCARTE_EXCEDE_MAXIMO" })) });
    const r = await ejecutar(repo, origen, storage);
    expect(r.tipo).toBe("FALLO");
    expect(repo.registrarFallo.mock.calls[0]![1]).toMatchObject({ tipo: "REVISION" });
  });

  it("worker obsoleto: si el lease ya no es vigente no sube nada ni confirma", async () => {
    const repo = repoFalso(null);
    const storage = storageFalso();
    const r = await ejecutar(repo, origenFalso(), storage);
    expect(r.tipo).toBe("LEASE_OBSOLETO");
    expect(storage.generarId).not.toHaveBeenCalled();
    expect(repo.confirmarConservado).not.toHaveBeenCalled();
  });

  it("si guardarProgreso rechaza por lease obsoleto durante la subida, aborta y no confirma", async () => {
    const repo = repoFalso(reclamado());
    let n = 0;
    repo.guardarProgreso.mockImplementation(async () => ++n < 3);
    const r = await ejecutar(repo, origenFalso(), storageFalso());
    expect(r.tipo).toBe("LEASE_OBSOLETO");
    expect(repo.confirmarConservado).not.toHaveBeenCalled();
  });

  it("SIGTERM durante un bloque: no registra fallo, deja el lease vencer y ajusta la reserva", async () => {
    const repo = repoFalso(reclamado());
    const control = new AbortController();
    const storage = storageFalso({
      subirBloque: vi.fn(async (_s: string, offset: bigint, b: Uint8Array) => { control.abort(); return { estado: "PARCIAL", bytesConfirmados: offset + BigInt(b.byteLength) }; })
    });
    const r = await transferirArchivoZoomUseCase(repo as never, origenFalso() as never, storage as never, LEASE, control.signal,
      { ahora: () => AHORA, limites: LIMITES, bloqueBytes: KIB, aleatorio: () => 0.5, heartbeatMs: 1_000_000, leaseMs: 300_000 } as never);
    expect(r.tipo).toBe("INTERRUMPIDO");
    expect(repo.registrarFallo).not.toHaveBeenCalled();
    expect(repo.liberarReserva).toHaveBeenCalled();
  });

  it("tamaño final distinto al subido: REQUIERE_REVISION", async () => {
    const repo = repoFalso(reclamado());
    const storage = storageFalso({ verificarArchivo: vi.fn(async (..._a: any[]) => ({ id: "drive-id", nombre: "a", tamanoBytes: 1n, mimeType: null, webViewUrl: null })) });
    const r = await ejecutar(repo, origenFalso(), storage);
    expect(r.tipo).toBe("FALLO");
    expect(repo.registrarFallo.mock.calls[0]![1]).toMatchObject({ tipo: "REVISION", codigo: "TAMANO_DISTINTO" });
    expect(repo.confirmarConservado).not.toHaveBeenCalled();
  });

  it("10 fallos consecutivos: el límite viaja al repositorio para marcar revisión sin borrar", async () => {
    const repo = repoFalso(reclamado({ intentos: 9 }));
    await ejecutar(repo, origenFalso(), storageFalso({ generarId: vi.fn(async (..._a: any[]) => { throw new Error("x"); }) }));
    expect(repo.registrarFallo.mock.calls[0]![1]).toMatchObject({ tipo: "REINTENTABLE", limiteIntentos: 10 });
  });
});

describe("procesarColaZoomUseCase", () => {
  it("respeta la concurrencia, termina con --once cuando la cola se vacía y no pierde ningún trabajo", async () => {
    const pendientes = ["a", "b", "c", "d", "e"].map((id, i) => ({ archivoId: id, version: 1, venceAt: new Date(AHORA.getTime() + 1e6 + i) }));
    let activos = 0, maxActivos = 0;
    const hechos: string[] = [];
    const reclamarArchivo = vi.fn(async (..._a: any[]) => pendientes.shift() ?? null);
    await procesarColaZoomUseCase({
      reclamarArchivo,
      procesar: async (lease) => { activos++; maxActivos = Math.max(maxActivos, activos); await new Promise((r) => setTimeout(r, 5)); hechos.push(lease.archivoId); activos--; },
      ahora: () => AHORA, esperar: async () => undefined, leaseMs: 300_000, esperaVaciaMs: 10
    }, { signal: new AbortController().signal, concurrencia: 2, unaVez: true });
    expect(maxActivos).toBe(2);
    expect(hechos.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("se detiene sin reclamar más al recibir la señal de apagado", async () => {
    const control = new AbortController();
    const reclamarArchivo = vi.fn(async (..._a: any[]) => ({ archivoId: "x", version: 1, venceAt: AHORA }));
    await procesarColaZoomUseCase({
      reclamarArchivo, procesar: async () => { control.abort(); },
      ahora: () => AHORA, esperar: async () => undefined, leaseMs: 300_000, esperaVaciaMs: 10
    }, { signal: control.signal, concurrencia: 1 });
    expect(reclamarArchivo).toHaveBeenCalledTimes(1);
  });

  it("con la cola vacía espera con la estrategia inyectada en lugar de girar", async () => {
    const control = new AbortController();
    const esperar = vi.fn(async (..._a: any[]) => { if (esperar.mock.calls.length >= 2) control.abort(); });
    await procesarColaZoomUseCase({
      reclamarArchivo: async () => null, procesar: async () => undefined,
      ahora: () => AHORA, esperar, leaseMs: 300_000, esperaVaciaMs: 10
    }, { signal: control.signal, concurrencia: 1 });
    expect(esperar).toHaveBeenCalledWith(10, expect.anything());
  });
});
