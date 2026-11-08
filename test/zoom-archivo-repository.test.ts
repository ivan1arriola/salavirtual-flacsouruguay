import { createHash, randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PREFIJO_REFERENCIA_ARCHIVO_ZOOM,
  referenciaExternaArchivoZoom,
  type ArchivoOrigenZoom,
  type LeaseArchivoZoom,
  type ReferenciaOcurrenciaZoom,
  type ResultadoInventarioZoom
} from "../src/modules/archivos/domain";
import { filtroArchivoReunionMeet } from "../src/modules/archivos/infrastructure/prisma/archivo-reunion-meet.filter";
import { crearPrismaArchivosRepositoryAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-archivos-repository.adapter";
import { crearPrismaZoomArchivoRepositoryAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-zoom-archivo-repository.adapter";
import type { ZoomArchivoRepositoryPort } from "../src/modules/archivos/ports";
import { obtenerDashboardDocente } from "../src/modules/dashboard/teacher-dashboard.adapter";

const GB = 1024n ** 3n;
const hash = (texto: string) => createHash("sha256").update(texto).digest("hex").slice(0, 24);
const LIMITES = { topeBytes: 80n * GB, reservaRecienteBytes: 20n * GB, ventanaMs: 24 * 3_600_000 };

function recurso(extra: Partial<ArchivoOrigenZoom> = {}): ArchivoOrigenZoom {
  const archivoZoomId = extra.archivoZoomId === undefined ? `f-${randomUUID()}` : extra.archivoZoomId;
  return {
    claveOrigen: extra.claveOrigen ?? hash(`clave|${archivoZoomId ?? randomUUID()}`),
    archivoZoomId,
    coleccion: "recording_files", tipoOriginal: "MP4", variante: "shared_screen", extension: "mp4",
    inicioAt: new Date("2026-03-05T14:00:00Z"), finAt: new Date("2026-03-05T15:00:00Z"), tamanoBytes: 1000n,
    estadoOrigen: "completed", descargable: true,
    ...extra
  };
}

function inventario(recursos: readonly ArchivoOrigenZoom[], extra: Partial<ResultadoInventarioZoom> = {}): ResultadoInventarioZoom {
  return { recursos, observaciones: [], procesamientoPendiente: false, ...extra };
}

describe("repositorio Zoom: mutaciones de worker comparan la versión vigente (unidad)", () => {
  const lease: LeaseArchivoZoom = { archivoId: "a-1", version: 3, venceAt: new Date("2026-11-08T12:05:00Z") };

  function crear(archivoOrigenZoom: Record<string, unknown>) {
    const db = { archivoOrigenZoom } as unknown as PrismaClient;
    return crearPrismaZoomArchivoRepositoryAdapter({ db, hash, reloj: () => new Date("2026-11-08T12:00:00Z") });
  }

  it("guardarProgreso devuelve false a un worker obsoleto y filtra por id, versión y estado", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });
    const repo = crear({ updateMany });
    await expect(repo.guardarProgreso(lease, { bytesConfirmados: 256n })).resolves.toBe(false);
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "a-1", leaseVersion: 3, estado: "COPIANDO" }
    }));
  });

  it("registrarFallo sanea el detalle y solo consume intento cuando corresponde", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = crear({ updateMany });
    await repo.registrarFallo(lease, {
      tipo: "REINTENTABLE", codigo: "ZOOM_500",
      detalle: "GET https://zoom.us/rec/download/x?access_token=SECRETO falló", proximoIntentoAt: null
    });
    const datos = updateMany.mock.calls[0][0].data;
    expect(datos.errorDetalle).not.toContain("SECRETO");
    expect(datos.errorDetalle).not.toContain("zoom.us");
    expect(datos.intentos).toEqual({ increment: 1 });
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ id: "a-1", leaseVersion: 3, estado: "COPIANDO" });

    updateMany.mockClear();
    await repo.registrarFallo(lease, { tipo: "ESPERA", codigo: "TOPE_DIARIO", proximoIntentoAt: new Date("2026-11-09T00:00:00Z") });
    expect(updateMany.mock.calls[0][0].data.intentos).toBeUndefined();
    expect(updateMany.mock.calls[0][0].data.estado).toBe("PENDIENTE");
  });

  it("reclamarArchivo usa concurrencia optimista y prueba el siguiente candidato si pierde la carrera", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "a-1", leaseVersion: 4 }, { id: "a-2", leaseVersion: 0 }]);
    const updateMany = vi.fn().mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 1 });
    const repo = crear({ findMany, updateMany });
    const ahora = new Date("2026-11-08T12:00:00Z");
    await expect(repo.reclamarArchivo(ahora, 60_000)).resolves.toEqual({
      archivoId: "a-2", version: 1, venceAt: new Date("2026-11-08T12:01:00Z")
    });
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ id: "a-1", leaseVersion: 4 });
    expect(updateMany.mock.calls[1][0].data).toMatchObject({ estado: "COPIANDO", leaseVersion: 1 });
  });

  it("nunca persiste una sesión de subida en claro (la URI de Drive es una credencial)", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = crear({ updateMany });
    await expect(repo.guardarProgreso(lease, {
      bytesConfirmados: 0n, uploadSessionCifrada: "https://www.googleapis.com/upload/drive/v3/files?upload_id=SECRETO"
    })).rejects.toThrow(/cifrad/);
    expect(updateMany).not.toHaveBeenCalled();
    await expect(repo.guardarProgreso(lease, { bytesConfirmados: 0n, uploadSessionCifrada: "v1:aXY=:dGFn:ZGF0bw==" })).resolves.toBe(true);
  });

  it("rechaza duraciones de lease inválidas", async () => {
    const repo = crear({});
    await expect(repo.reclamarArchivo(new Date(), 0)).rejects.toThrow(RangeError);
  });

  it("recuperar un lease vencido consume un intento y cierra las reservas del intento caído", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "a-1", leaseVersion: 4, estado: "COPIANDO" }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const reservas = { findMany: vi.fn().mockResolvedValue([]), updateMany: vi.fn() };
    const db = { archivoOrigenZoom: { findMany, updateMany }, reservaTransferenciaZoom: reservas } as unknown as PrismaClient;
    const repo = crearPrismaZoomArchivoRepositoryAdapter({ db, hash });
    await expect(repo.reclamarArchivo(new Date("2026-11-08T12:00:00Z"), 60_000)).resolves.toMatchObject({ archivoId: "a-1", version: 5 });
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ id: "a-1", leaseVersion: 4, estado: "COPIANDO" });
    expect(updateMany.mock.calls[0][0].data).toMatchObject({ estado: "COPIANDO", leaseVersion: 5, intentos: { increment: 1 }, errorCodigo: "LEASE_VENCIDO" });
    expect(reservas.findMany.mock.calls[0][0].where).toMatchObject({ archivoOrigenId: "a-1", liberadoAt: null, leaseVersion: { lt: 5 } });
  });

  it("un reclamo normal no consume intentos", async () => {
    const findMany = vi.fn().mockResolvedValue([{ id: "a-2", leaseVersion: 0, estado: "PENDIENTE" }]);
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const repo = crear({ findMany, updateMany });
    await repo.reclamarArchivo(new Date("2026-11-08T12:00:00Z"), 60_000);
    expect(updateMany.mock.calls[0][0].data.intentos).toBeUndefined();
    expect(updateMany.mock.calls[0][0].where).toMatchObject({ estado: "PENDIENTE" });
  });
});

describe("listados Meet existentes excluyen referencias de origen Zoom (unidad)", () => {
  it("el predicado compartido coincide con el prefijo de referencia del inventario Zoom", () => {
    expect(referenciaExternaArchivoZoom("cta", "uuid", "clave", hash).startsWith(PREFIJO_REFERENCIA_ARCHIVO_ZOOM)).toBe(true);
    expect(filtroArchivoReunionMeet()).toEqual({ NOT: { externalResourceName: { startsWith: PREFIJO_REFERENCIA_ARCHIVO_ZOOM } } });
  });

  it("listarArchivosVisibles aplica el predicado compartido", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const repo = crearPrismaArchivosRepositoryAdapter({ archivoReunion: { findMany } } as unknown as PrismaClient);
    await repo.listarArchivosVisibles({ id: "u", rol: "ADMINISTRACION" });
    expect(findMany.mock.calls[0][0].where.AND).toContainEqual(filtroArchivoReunionMeet());
  });
});

const enabled = process.env.MEET_HISTORY_DATABASE_TEST === "1";

describe.skipIf(!enabled)("repositorio Zoom con PostgreSQL real", () => {
  const db = new PrismaClient();
  const db2 = new PrismaClient();
  const tag = randomUUID();
  let reloj = new Date("2026-11-08T12:00:00Z");
  const repo: ZoomArchivoRepositoryPort = crearPrismaZoomArchivoRepositoryAdapter({ db, hash, reloj: () => reloj });
  const repo2: ZoomArchivoRepositoryPort = crearPrismaZoomArchivoRepositoryAdapter({ db: db2, hash, reloj: () => reloj });
  const actor = { id: tag };
  let solicitudId = "";
  let ordinal = 0;
  let eventoA = "";
  let eventoB = "";
  let eventoMeet = "";

  async function crearEvento(tipo: "ZOOM" | "GOOGLE_MEET") {
    const proveedor = await db.proveedorReunion.upsert({
      where: { tipo }, update: {}, create: { tipo, nombre: `${tipo} CI` }
    });
    const instancia = await db.instanciaSala.create({ data: {
      solicitudSalaId: solicitudId, ordinal: ++ordinal, inicioProgramadoAt: new Date(),
      finProgramadoAt: new Date(), timezone: "America/Montevideo"
    } });
    const evento = await db.eventoProveedor.create({ data: { instanciaSalaId: instancia.id, proveedorId: proveedor.id } });
    return { eventoId: evento.id, instanciaId: instancia.id };
  }

  function referencia(extra: Partial<ReferenciaOcurrenciaZoom> = {}): ReferenciaOcurrenciaZoom {
    return {
      cuentaZoomId: "cuenta-ci", uuid: `${randomUUID()}/==`, meetingId: "8123456789",
      anfitrionZoomId: "host-ci", inicioRealAt: new Date("2026-03-05T14:00:00Z"), titulo: "Clase CI", ...extra
    };
  }

  async function guardar(ref: ReferenciaOcurrenciaZoom, recursos: readonly ArchivoOrigenZoom[], extra: Partial<ResultadoInventarioZoom> = {}) {
    return repo.guardarInventario(
      { referencia: ref, cuentaProveedorId: null, inventariadoAt: reloj, proximoInventarioAt: new Date(reloj.getTime() + 600_000) },
      inventario(recursos, extra)
    );
  }

  async function archivoPorClave(ocurrenciaId: string, claveOrigen: string) {
    return db.archivoOrigenZoom.findUniqueOrThrow({ where: { ocurrenciaId_claveOrigen: { ocurrenciaId, claveOrigen } } });
  }

  async function reclamarYConservar(driveFileId = `drive-${randomUUID()}`) {
    const lease = await repo.reclamarArchivo(reloj, 300_000);
    if (!lease) throw new Error("no había archivo reclamable");
    const ok = await repo.confirmarConservado(lease, {
      id: driveFileId, nombre: "video.mp4", tamanoBytes: 1000n, mimeType: "video/mp4",
      webViewUrl: `https://drive.google.com/file/d/${driveFileId}/view`
    });
    return { lease, ok, driveFileId };
  }

  beforeAll(async () => {
    // Esta suite nunca debe ejecutarse contra una base de producción o tunelizada.
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/flacso_meet_history_ci") {
      throw new Error("Esta prueba requiere PostgreSQL CI aislado.");
    }
    await db.usuario.create({ data: { id: tag, nombres: "CI Zoom", rol: "ADMINISTRACION" } });
    const docente = await db.docente.create({ data: { usuarioId: tag } });
    const programa = await db.programa.create({ data: { nombre: `prog-${tag}` } });
    const dp = await db.docentePrograma.create({ data: { docenteId: docente.id, programaId: programa.id } });
    const solicitud = await db.solicitudSala.create({ data: {
      titulo: "Zoom CI", docenteProgramaId: dp.id, creadaPorUsuarioId: tag, modalidad: "VIRTUAL",
      tipoInstancias: "MULTIPLE", timezone: "America/Montevideo", fechaInicioSolicitada: new Date(), fechaFinSolicitada: new Date()
    } });
    solicitudId = solicitud.id;
    eventoA = (await crearEvento("ZOOM")).eventoId;
    eventoB = (await crearEvento("ZOOM")).eventoId;
    eventoMeet = (await crearEvento("GOOGLE_MEET")).eventoId;
  });

  beforeEach(async () => {
    reloj = new Date("2026-11-08T12:00:00Z");
    // La cola y el cupo son globales: cada prueba parte de tablas Zoom vacías en la base CI descartable.
    await db.reservaTransferenciaZoom.deleteMany({});
    await db.archivoOrigenZoom.deleteMany({});
    await db.ocurrenciaArchivoZoom.deleteMany({});
    await db.barridoArchivoZoom.deleteMany({});
    await db.archivoReunion.deleteMany({ where: { eventoProveedor: { instancia: { solicitudSalaId: solicitudId } } } });
  });

  afterAll(async () => {
    if (solicitudId) {
      await db.reservaTransferenciaZoom.deleteMany({});
      await db.archivoOrigenZoom.deleteMany({});
      await db.ocurrenciaArchivoZoom.deleteMany({});
      await db.solicitudSala.deleteMany({ where: { id: solicitudId } });
    }
    await Promise.all([db.$disconnect(), db2.$disconnect()]);
  });

  it("un reinventario actualiza metadatos sin resetear archivos conservados", async () => {
    const ref = referencia();
    const video = recurso();
    const procesando = recurso({ archivoZoomId: "f-proc", descargable: false, estadoOrigen: "processing" });
    const primero = await guardar(ref, [video, procesando], { procesamientoPendiente: true });
    expect(primero).toMatchObject({ nuevos: 2, actualizados: 0, requierenRevision: 0 });
    expect((await archivoPorClave(primero.ocurrenciaId, procesando.claveOrigen)).estado).toBe("PROCESANDO_ORIGEN");

    const { ok, driveFileId } = await reclamarYConservar();
    expect(ok).toBe(true);
    const conservado = await archivoPorClave(primero.ocurrenciaId, video.claveOrigen);

    reloj = new Date("2026-11-08T13:00:00Z");
    const segundo = await guardar(ref, [{ ...video, tamanoBytes: 2000n }, { ...procesando, descargable: true, estadoOrigen: "completed" }]);
    expect(segundo).toMatchObject({ ocurrenciaId: primero.ocurrenciaId, nuevos: 0, actualizados: 2 });
    const despues = await archivoPorClave(primero.ocurrenciaId, video.claveOrigen);
    expect(despues).toMatchObject({
      estado: "CONSERVADO", driveFileId, bytesConfirmados: 1000n, intentos: 0,
      leaseVersion: conservado.leaseVersion, nombreDestino: conservado.nombreDestino, tamanoBytes: 2000n
    });
    expect(despues.ultimaObservacionAt).toEqual(reloj);
    expect((await archivoPorClave(primero.ocurrenciaId, procesando.claveOrigen)).estado).toBe("PENDIENTE");
    const ocurrencia = await db.ocurrenciaArchivoZoom.findUniqueOrThrow({ where: { id: primero.ocurrenciaId } });
    expect(ocurrencia).toMatchObject({ procesamientoPendiente: false, inventariadoAt: reloj, titulo: "Clase CI", eventoProveedorId: null });
  });

  it("una identidad ambigua del dominio queda REQUIERE_REVISION y no se reclama", async () => {
    const ref = referencia();
    const chat = recurso({ archivoZoomId: null, tipoOriginal: "CHAT", extension: "txt", claveOrigen: "clave-ambigua" });
    const r = await guardar(ref, [chat], {
      observaciones: [{ tipo: "IDENTIDAD_AMBIGUA", coleccion: "recording_files", claveOrigen: "clave-ambigua", multiplicidad: 2 }]
    });
    expect(r.requierenRevision).toBe(1);
    expect(await archivoPorClave(r.ocurrenciaId, "clave-ambigua")).toMatchObject({
      estado: "REQUIERE_REVISION", errorCodigo: "IDENTIDAD_AMBIGUA", multiplicidadObservada: 2
    });
    expect(await repo.reclamarArchivo(reloj, 60_000)).toBeNull();
    const ocurrencia = await db.ocurrenciaArchivoZoom.findUniqueOrThrow({ where: { id: r.ocurrenciaId } });
    expect(ocurrencia.observacionesInventario).toEqual([
      { tipo: "IDENTIDAD_AMBIGUA", coleccion: "recording_files", claveOrigen: "clave-ambigua", multiplicidad: 2 }
    ]);
  });

  it("los nombres de destino que colisionan tras sanear se desambiguan dentro de la ocurrencia", async () => {
    const ref = referencia();
    const a = recurso({ archivoZoomId: "a/b" });
    const b = recurso({ archivoZoomId: "a-b" });
    const r = await guardar(ref, [a, b]);
    const c = recurso({ archivoZoomId: "a:b" });
    await guardar(ref, [a, b, c]);
    const nombres = (await db.archivoOrigenZoom.findMany({ where: { ocurrenciaId: r.ocurrenciaId } })).map((x) => x.nombreDestino);
    expect(nombres).toHaveLength(3);
    expect(new Set(nombres).size).toBe(3);
    expect(nombres.every((n) => n.startsWith("2026-03-05_MP4_shared_screen_a-b") && n.endsWith(".mp4"))).toBe(true);
  });

  it("dos workers simultáneos nunca reclaman el mismo archivo", async () => {
    await guardar(referencia(), [recurso()]);
    const unico = await Promise.all([repo.reclamarArchivo(reloj, 60_000), repo2.reclamarArchivo(reloj, 60_000)]);
    expect(unico.filter(Boolean)).toHaveLength(1);

    await guardar(referencia(), [recurso(), recurso()]);
    const varios = await Promise.all([
      repo.reclamarArchivo(reloj, 60_000), repo2.reclamarArchivo(reloj, 60_000),
      repo.reclamarArchivo(reloj, 60_000), repo2.reclamarArchivo(reloj, 60_000)
    ]);
    const ids = varios.filter((l): l is LeaseArchivoZoom => l !== null).map((l) => l.archivoId);
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });

  it("un lease vencido se reasigna con otra versión y el worker obsoleto queda rechazado", async () => {
    const r = await guardar(referencia(), [recurso()]);
    const t0 = reloj;
    const viejo = (await repo.reclamarArchivo(t0, 60_000))!;
    expect(viejo.venceAt).toEqual(new Date(t0.getTime() + 60_000));
    expect(await repo2.reclamarArchivo(new Date(t0.getTime() + 30_000), 60_000)).toBeNull();
    const nuevo = (await repo2.reclamarArchivo(new Date(t0.getTime() + 61_000), 60_000))!;
    expect(nuevo).toMatchObject({ archivoId: viejo.archivoId, version: viejo.version + 1 });

    expect(await repo.guardarProgreso(viejo, { bytesConfirmados: 999n })).toBe(false);
    expect(await repo.registrarFallo(viejo, { tipo: "REINTENTABLE", codigo: "X", proximoIntentoAt: null })).toBe(false);
    expect(await repo.confirmarConservado(viejo, {
      id: "drive-obsoleto", nombre: "x", tamanoBytes: 1n, mimeType: null, webViewUrl: null
    })).toBe(false);
    expect(await repo.obtenerArchivoReclamado(viejo)).toBeNull();

    expect(await repo2.guardarProgreso(nuevo, {
      bytesConfirmados: 512n, uploadSessionCifrada: "v1:aXY=:dGFn:c2VzaW9u", driveFileId: "drive-pregenerado",
      leaseHasta: new Date(t0.getTime() + 200_000)
    })).toBe(true);
    const fila = await db.archivoOrigenZoom.findUniqueOrThrow({ where: { id: nuevo.archivoId } });
    expect(fila).toMatchObject({
      estado: "COPIANDO", bytesConfirmados: 512n, uploadSessionCifrada: "v1:aXY=:dGFn:c2VzaW9u",
      driveFileId: "drive-pregenerado", leaseHasta: new Date(t0.getTime() + 200_000)
    });
    const reclamado = await repo2.obtenerArchivoReclamado(nuevo);
    expect(reclamado).toMatchObject({
      ocurrenciaId: r.ocurrenciaId, bytesConfirmados: 512n, driveFileId: "drive-pregenerado",
      uploadSessionCifrada: "v1:aXY=:dGFn:c2VzaW9u", eventoProveedorId: null
    });
    expect(reclamado?.ocurrencia.uuid).toBeDefined();
    expect(reclamado?.recurso.tamanoBytes).toBe(1000n);
  });

  it("un trabajo COPIANDO abandonado se recupera aunque el reinventario ya no ofrezca descarga", async () => {
    const ref = referencia();
    const video = recurso();
    await guardar(ref, [video]);
    const abandonado = (await repo.reclamarArchivo(reloj, 60_000))!;
    await guardar(ref, [{ ...video, descargable: false, estadoOrigen: null }]);
    const recuperado = await repo2.reclamarArchivo(new Date(reloj.getTime() + 61_000), 60_000);
    expect(recuperado).toMatchObject({ archivoId: abandonado.archivoId, version: abandonado.version + 1 });
    // El nuevo worker registra el fallo y el recurso queda visible, sin reintentos mientras no sea descargable.
    expect(await repo2.registrarFallo(recuperado!, { tipo: "REINTENTABLE", codigo: "ZOOM_404", proximoIntentoAt: null })).toBe(true);
    expect(await repo.reclamarArchivo(new Date(reloj.getTime() + 3_600_000), 60_000)).toBeNull();
  });

  it("cada recuperación de un lease vencido consume un intento visible para el worker", async () => {
    await guardar(referencia(), [recurso()]);
    const inicial = (await repo.reclamarArchivo(reloj, 60_000))!;
    let ahora = reloj;
    for (const esperado of [1, 2, 3]) {
      ahora = new Date(ahora.getTime() + 61_000);
      const lease = (await repo2.reclamarArchivo(ahora, 60_000))!;
      expect(lease).toMatchObject({ archivoId: inicial.archivoId, version: inicial.version + esperado });
      expect(await repo2.obtenerArchivoReclamado(lease)).toMatchObject({ intentos: esperado });
    }
    expect(await db.archivoOrigenZoom.findUniqueOrThrow({ where: { id: inicial.archivoId } }))
      .toMatchObject({ estado: "COPIANDO", intentos: 3, errorCodigo: "LEASE_VENCIDO" });
  });

  it("las referencias locales Zoom no aparecen en los listados Meet existentes; las de Meet sí", async () => {
    const r = await guardar(referencia(), [recurso()]);
    await repo.vincularOcurrencia(r.ocurrenciaId, eventoA, actor);
    const { driveFileId } = await reclamarYConservar();
    const zoomRef = await db.archivoReunion.findUniqueOrThrow({ where: { driveFileId } });
    expect(zoomRef.externalResourceName.startsWith(PREFIJO_REFERENCIA_ARCHIVO_ZOOM)).toBe(true);
    const meetRef = await db.archivoReunion.create({ data: {
      eventoProveedorId: eventoMeet, tipo: "GRABACION", externalResourceName: `conferenceRecords/${randomUUID()}/recordings/r1`,
      driveFileId: `drive-meet-${randomUUID()}`, nombre: "meet.mp4", capturadoAt: reloj
    } });

    const visibles = await crearPrismaArchivosRepositoryAdapter(db).listarArchivosVisibles({ id: tag, rol: "DOCENTE" });
    expect(visibles.map((a) => a.id)).toContain(meetRef.id);
    expect(visibles.map((a) => a.id)).not.toContain(zoomRef.id);

    const tablero = await obtenerDashboardDocente(db, tag, reloj);
    expect(tablero.recentRecordings.map((g) => g.id)).toContain(meetRef.id);
    expect(tablero.recentRecordings.map((g) => g.id)).not.toContain(zoomRef.id);
  });

  it("registrar fallo: backoff persistente, espera de cupo sin consumir intentos y revisión al límite", async () => {
    const r = await guardar(referencia(), [recurso()]);
    const lease1 = (await repo.reclamarArchivo(reloj, 60_000))!;
    const reintento = new Date(reloj.getTime() + 300_000);
    expect(await repo.registrarFallo(lease1, {
      tipo: "REINTENTABLE", codigo: "ZOOM_500", detalle: "https://zoom.us/x?access_token=SECRETO", proximoIntentoAt: reintento, limiteIntentos: 2
    })).toBe(true);
    let fila = await db.archivoOrigenZoom.findUniqueOrThrow({ where: { id: lease1.archivoId } });
    expect(fila).toMatchObject({ estado: "ERROR_REINTENTABLE", intentos: 1, proximoIntentoAt: reintento, errorCodigo: "ZOOM_500", leaseHasta: null });
    expect(fila.errorDetalle).not.toContain("SECRETO");
    expect(await repo.reclamarArchivo(new Date(reintento.getTime() - 1), 60_000)).toBeNull();

    const lease2 = (await repo.reclamarArchivo(reintento, 60_000))!;
    const liberacion = new Date(reintento.getTime() + 3_600_000);
    expect(await repo.registrarFallo(lease2, { tipo: "ESPERA", codigo: "TOPE_DIARIO", proximoIntentoAt: liberacion })).toBe(true);
    fila = await db.archivoOrigenZoom.findUniqueOrThrow({ where: { id: lease2.archivoId } });
    expect(fila).toMatchObject({ estado: "PENDIENTE", intentos: 1, errorCodigo: "TOPE_DIARIO", proximoIntentoAt: liberacion });

    const lease3 = (await repo.reclamarArchivo(liberacion, 60_000))!;
    expect(await repo.registrarFallo(lease3, { tipo: "REINTENTABLE", codigo: "ZOOM_500", proximoIntentoAt: null, limiteIntentos: 2 })).toBe(true);
    fila = await archivoPorClave(r.ocurrenciaId, fila.claveOrigen);
    expect(fila).toMatchObject({ estado: "REQUIERE_REVISION", intentos: 2, errorCodigo: "ZOOM_500" });
    expect(await repo.reclamarArchivo(new Date(liberacion.getTime() + 86_400_000), 60_000)).toBeNull();
  });

  it("con encuentro, estado conservado y ArchivoReunion se confirman en la misma transacción", async () => {
    const ref = referencia();
    const video = recurso();
    const r = await guardar(ref, [video]);
    expect(await repo.vincularOcurrencia(r.ocurrenciaId, eventoA, actor)).toEqual({ tipo: "VINCULADA", referenciasCreadas: 0 });
    const { ok, driveFileId } = await reclamarYConservar();
    expect(ok).toBe(true);
    const fila = await archivoPorClave(r.ocurrenciaId, video.claveOrigen);
    const referenciaLocal = await db.archivoReunion.findUniqueOrThrow({ where: { driveFileId } });
    expect(fila).toMatchObject({ estado: "CONSERVADO", archivoReunionId: referenciaLocal.id, uploadSessionCifrada: null, leaseHasta: null });
    expect(referenciaLocal).toMatchObject({
      eventoProveedorId: eventoA, tipo: "GRABACION", nombre: "video.mp4", tamanoBytes: 1000n, mimeType: "video/mp4",
      externalResourceName: `zoom/${hash(ref.cuentaZoomId)}/${hash(ref.uuid)}/${video.claveOrigen}`
    });
  });

  it("si falla la referencia local no queda CONSERVADO a medias y el mismo Drive ID nunca se registra dos veces", async () => {
    const ref = referencia();
    const r = await guardar(ref, [recurso(), recurso(), recurso()]);
    await repo.vincularOcurrencia(r.ocurrenciaId, eventoA, actor);
    const primero = await reclamarYConservar("drive-compartido");
    expect(primero.ok).toBe(true);

    // Otro archivo de origen confirma el mismo Drive ID: no se crea una segunda referencia.
    const duplicado = (await repo.reclamarArchivo(reloj, 300_000))!;
    expect(await repo.confirmarConservado(duplicado, {
      id: "drive-compartido", nombre: "otro.mp4", tamanoBytes: 1000n, mimeType: "video/mp4", webViewUrl: null
    })).toBe(false);
    expect(await db.archivoOrigenZoom.findUniqueOrThrow({ where: { id: duplicado.archivoId } })).toMatchObject({
      estado: "REQUIERE_REVISION", errorCodigo: "DRIVE_ID_DUPLICADO", driveFileId: null, archivoReunionId: null
    });
    expect(await db.archivoReunion.count({ where: { driveFileId: "drive-compartido" } })).toBe(1);

    // La referencia local falla (Drive ID ya registrado por Meet): el estado CONSERVADO se revierte con ella.
    await db.archivoReunion.create({ data: {
      eventoProveedorId: eventoMeet, tipo: "GRABACION", externalResourceName: `meet/${randomUUID()}`,
      driveFileId: "drive-ocupado-meet", nombre: "meet.mp4"
    } });
    const conflicto = (await repo.reclamarArchivo(reloj, 300_000))!;
    expect(await repo.confirmarConservado(conflicto, {
      id: "drive-ocupado-meet", nombre: "z.mp4", tamanoBytes: 1000n, mimeType: "video/mp4", webViewUrl: null
    })).toBe(false);
    expect(await db.archivoOrigenZoom.findUniqueOrThrow({ where: { id: conflicto.archivoId } })).toMatchObject({
      estado: "REQUIERE_REVISION", errorCodigo: "DRIVE_ID_DUPLICADO", driveFileId: null, archivoReunionId: null, conservadoAt: null
    });
    expect(await db.archivoReunion.findUniqueOrThrow({ where: { driveFileId: "drive-ocupado-meet" } }))
      .toMatchObject({ eventoProveedorId: eventoMeet });
  });

  it("confirmar dos veces con el mismo lease y destino es idempotente", async () => {
    const r = await guardar(referencia(), [recurso()]);
    await repo.vincularOcurrencia(r.ocurrenciaId, eventoA, actor);
    const lease = (await repo.reclamarArchivo(reloj, 300_000))!;
    const destino = { id: "drive-idem", nombre: "v.mp4", tamanoBytes: 1000n, mimeType: "video/mp4", webViewUrl: null };
    expect(await repo.confirmarConservado(lease, destino)).toBe(true);
    expect(await repo.confirmarConservado(lease, destino)).toBe(true);
    expect(await repo.confirmarConservado(lease, { ...destino, id: "drive-distinto" })).toBe(false);
    expect(await db.archivoReunion.count({ where: { driveFileId: "drive-idem" } })).toBe(1);
  });

  it("sin encuentro basta el inventario; vincular después crea referencias sin transferir de nuevo", async () => {
    const ref = referencia();
    const video = recurso();
    const r = await guardar(ref, [video]);
    const { ok, driveFileId } = await reclamarYConservar();
    expect(ok).toBe(true);
    expect(await db.archivoReunion.count({ where: { driveFileId } })).toBe(0);
    const antes = await archivoPorClave(r.ocurrenciaId, video.claveOrigen);

    expect(await repo.vincularOcurrencia(r.ocurrenciaId, eventoA, actor)).toEqual({ tipo: "VINCULADA", referenciasCreadas: 1 });
    const local = await db.archivoReunion.findUniqueOrThrow({ where: { driveFileId } });
    expect(local.externalResourceName).toBe(`zoom/${hash(ref.cuentaZoomId)}/${hash(ref.uuid)}/${video.claveOrigen}`);
    const despues = await archivoPorClave(r.ocurrenciaId, video.claveOrigen);
    expect(despues).toMatchObject({ estado: "CONSERVADO", driveFileId, leaseVersion: antes.leaseVersion, archivoReunionId: local.id });
    expect(await repo.reclamarArchivo(reloj, 60_000)).toBeNull();
    expect(await repo.vincularOcurrencia(r.ocurrenciaId, eventoA, actor)).toEqual({ tipo: "YA_VINCULADA" });
    expect(await db.archivoReunion.count({ where: { driveFileId } })).toBe(1);
  });

  it("varias ocurrencias pueden vincularse a un encuentro; una ocurrencia nunca a dos", async () => {
    const o1 = await guardar(referencia(), [recurso()]);
    const o2 = await guardar(referencia(), [recurso()]);
    expect(await repo.vincularOcurrencia(o1.ocurrenciaId, eventoA, actor)).toMatchObject({ tipo: "VINCULADA" });
    expect(await repo.vincularOcurrencia(o2.ocurrenciaId, eventoA, actor)).toMatchObject({ tipo: "VINCULADA" });
    expect(await repo.vincularOcurrencia(o1.ocurrenciaId, eventoB, actor)).toEqual({ tipo: "VINCULADA_A_OTRO", eventoProveedorId: eventoA });

    const o3 = await guardar(referencia(), [recurso()]);
    const carrera = await Promise.all([
      repo.vincularOcurrencia(o3.ocurrenciaId, eventoA, actor),
      repo2.vincularOcurrencia(o3.ocurrenciaId, eventoB, actor)
    ]);
    expect(carrera.map((x) => x.tipo).sort()).toEqual(["VINCULADA", "VINCULADA_A_OTRO"]);
    expect(await db.ocurrenciaArchivoZoom.count({ where: { eventoProveedorId: eventoA } })).toBe(carrera[0].tipo === "VINCULADA" ? 3 : 2);

    expect(await repo.vincularOcurrencia(o3.ocurrenciaId, eventoMeet, actor)).toEqual({ tipo: "EVENTO_NO_ZOOM" });
    expect(await repo.vincularOcurrencia("no-existe", eventoA, actor)).toEqual({ tipo: "NO_ENCONTRADA", recurso: "OCURRENCIA" });
    const o4 = await guardar(referencia(), [recurso()]);
    expect(await repo.vincularOcurrencia(o4.ocurrenciaId, "no-existe", actor)).toEqual({ tipo: "NO_ENCONTRADA", recurso: "EVENTO" });
  });

  it("el desvínculo es auditado, quita solo referencias locales y permite revincular el mismo Drive ID", async () => {
    const ref = referencia();
    const r = await guardar(ref, [recurso()]);
    expect(await repo.vincularOcurrencia(r.ocurrenciaId, eventoA, actor)).toMatchObject({ tipo: "VINCULADA" });
    const { driveFileId } = await reclamarYConservar();
    expect(await db.archivoReunion.count({ where: { driveFileId } })).toBe(1);

    expect(await repo.desvincularOcurrencia(r.ocurrenciaId, eventoB, actor)).toEqual({ tipo: "NO_VINCULADA" });
    expect(await repo.desvincularOcurrencia(r.ocurrenciaId, eventoA, actor)).toEqual({ tipo: "DESVINCULADA", referenciasEliminadas: 1 });
    expect(await db.archivoReunion.count({ where: { driveFileId } })).toBe(0);
    const archivos = await db.archivoOrigenZoom.findMany({ where: { ocurrenciaId: r.ocurrenciaId } });
    expect(archivos).toHaveLength(1);
    expect(archivos[0]).toMatchObject({ estado: "CONSERVADO", driveFileId, archivoReunionId: null });
    expect(await db.ocurrenciaArchivoZoom.findUniqueOrThrow({ where: { id: r.ocurrenciaId } }))
      .toMatchObject({ eventoProveedorId: null, vinculadaAt: null, vinculadaPorId: null });

    const auditorias = await db.auditoria.findMany({ where: { entidadTipo: "OcurrenciaArchivoZoom", entidadId: r.ocurrenciaId } });
    expect(auditorias.map((a) => a.accion).sort()).toEqual(["ZOOM_OCURRENCIA_DESVINCULADA", "ZOOM_OCURRENCIA_VINCULADA"]);
    expect(auditorias.every((a) => a.actorUsuarioId === tag)).toBe(true);
    const desvinculo = auditorias.find((a) => a.accion === "ZOOM_OCURRENCIA_DESVINCULADA")!;
    expect(desvinculo.valorAnterior).toMatchObject({ eventoProveedorId: eventoA });
    expect(desvinculo.valorNuevo).toMatchObject({ eventoProveedorId: null, referenciasEliminadas: 1 });
    expect(JSON.stringify(auditorias)).not.toMatch(/https?:/);

    expect(await repo.vincularOcurrencia(r.ocurrenciaId, eventoB, actor)).toEqual({ tipo: "VINCULADA", referenciasCreadas: 1 });
    expect(await db.archivoReunion.findUniqueOrThrow({ where: { driveFileId } })).toMatchObject({ eventoProveedorId: eventoB });
    expect(await repo.reclamarArchivo(reloj, 60_000)).toBeNull();
    expect(await repo.desvincularOcurrencia("no-existe", eventoA, null)).toEqual({ tipo: "NO_ENCONTRADA" });
  });

  it("borrar el encuentro no borra ocurrencias ni archivos de origen conservados", async () => {
    const { eventoId, instanciaId } = await crearEvento("ZOOM");
    const r = await guardar(referencia(), [recurso()]);
    await repo.vincularOcurrencia(r.ocurrenciaId, eventoId, actor);
    const { driveFileId } = await reclamarYConservar();
    await db.instanciaSala.delete({ where: { id: instanciaId } });
    expect(await db.ocurrenciaArchivoZoom.findUniqueOrThrow({ where: { id: r.ocurrenciaId } }))
      .toMatchObject({ eventoProveedorId: null });
    expect(await db.archivoOrigenZoom.findFirstOrThrow({ where: { ocurrenciaId: r.ocurrenciaId } }))
      .toMatchObject({ estado: "CONSERVADO", driveFileId, archivoReunionId: null });
    expect(await db.archivoReunion.count({ where: { driveFileId } })).toBe(0);
  });

  describe("cupo de transferencia atómico", () => {
    // Conexiones ya abiertas en ambos clientes: las transacciones concurrentes se solapan de verdad.
    beforeEach(async () => {
      await Promise.all([db, db2].flatMap((c) => Array.from({ length: 4 }, () => c.$executeRaw`SELECT pg_sleep(0.05)`)));
    });

    async function leases(cantidad: number): Promise<LeaseArchivoZoom[]> {
      await guardar(referencia(), Array.from({ length: cantidad }, () => recurso()));
      const resultado: LeaseArchivoZoom[] = [];
      for (let i = 0; i < cantidad; i++) resultado.push((await repo.reclamarArchivo(reloj, 600_000))!);
      return resultado;
    }

    async function usar(lease: LeaseArchivoZoom, bytes: bigint, horasAtras: number) {
      await db.reservaTransferenciaZoom.create({ data: {
        archivoOrigenId: lease.archivoId, leaseVersion: lease.version, bytesReservados: bytes,
        prioridad: "RECIENTE", reservadoAt: new Date(reloj.getTime() - horasAtras * 3_600_000)
      } });
    }

    it("con 29 GB usados, de cuatro archivos de 50 GB concurrentes solo uno reserva (la ventana queda en 79 GB)", async () => {
      const [semilla, ...ls] = await leases(5);
      await usar(semilla, 29n * GB, 3);
      const resultados = await Promise.all(ls.map((l, i) => (i % 2 ? repo2 : repo).reservarTransferencia(l, {
        bytes: 50n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES
      })));
      expect(resultados.filter((x) => x.tipo === "RESERVADA")).toHaveLength(1);
      expect(resultados.filter((x) => x.tipo === "SIN_CUPO")).toHaveLength(3);
      const suma = await db.reservaTransferenciaZoom.aggregate({ _sum: { bytesReservados: true } });
      expect(suma._sum.bytesReservados).toBe(79n * GB);
    });

    it("con 79 GB usados, dos archivos de 50 GB no caben y se estima la liberación", async () => {
      const [semilla, a, b] = await leases(3);
      await usar(semilla, 79n * GB, 5);
      const resultados = await Promise.all([
        repo.reservarTransferencia(a, { bytes: 50n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES }),
        repo2.reservarTransferencia(b, { bytes: 50n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES })
      ]);
      const liberacion = new Date(reloj.getTime() + 19 * 3_600_000);
      expect(resultados).toEqual([
        { tipo: "SIN_CUPO", disponibleBytes: 1n * GB, liberacionEstimadaAt: liberacion },
        { tipo: "SIN_CUPO", disponibleBytes: 1n * GB, liberacionEstimadaAt: liberacion }
      ]);
    });

    it("con 79 GB usados, de seis reservas concurrentes de 1 GB solo una entra en el tope", async () => {
      const [semilla, ...ls] = await leases(7);
      await usar(semilla, 79n * GB, 1);
      const resultados = await Promise.all(ls.map((l, i) => (i % 2 ? repo2 : repo).reservarTransferencia(l, {
        bytes: 1n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES
      })));
      expect(resultados.filter((x) => x.tipo === "RESERVADA")).toHaveLength(1);
    });

    it("el histórico no consume los 20 GB reservados para recientes", async () => {
      const [semilla, h, rec] = await leases(3);
      await usar(semilla, 50n * GB, 1);
      expect(await repo.reservarTransferencia(h, { bytes: 11n * GB, prioridad: "HISTORICO", ahora: reloj, limites: LIMITES }))
        .toMatchObject({ tipo: "SIN_CUPO", disponibleBytes: 10n * GB });
      expect(await repo.reservarTransferencia(rec, { bytes: 11n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES }))
        .toMatchObject({ tipo: "RESERVADA", bytesReservados: 11n * GB });
    });

    it("recuperar un lease vencido cierra su reserva con los bytes confirmados y no la duplica", async () => {
      const [lease1] = await leases(1);
      const solicitud = (ahora: Date, bytes: bigint) => ({ bytes, prioridad: "RECIENTE" as const, ahora, limites: LIMITES });
      expect((await repo.reservarTransferencia(lease1, solicitud(reloj, 50n * GB))).tipo).toBe("RESERVADA");
      expect(await repo.guardarProgreso(lease1, { bytesConfirmados: 10n * GB })).toBe(true);

      // El worker cae tras confirmar 10 GB: al recuperar el lease, su reserva se cierra con lo transferido.
      const t2 = new Date(reloj.getTime() + 601_000);
      const lease2 = (await repo2.reclamarArchivo(t2, 600_000))!;
      expect(await db.reservaTransferenciaZoom.findMany({ where: { archivoOrigenId: lease1.archivoId } })).toEqual([
        expect.objectContaining({ bytesReservados: 50n * GB, ajustadoBytes: 10n * GB, liberadoAt: t2 })
      ]);
      expect((await repo2.reservarTransferencia(lease2, solicitud(t2, 40n * GB))).tipo).toBe("RESERVADA");

      // Cae otra vez sin avanzar: la reserva de ese intento queda en 0 y el resto se reserva una sola vez.
      const t3 = new Date(t2.getTime() + 601_000);
      const lease3 = (await repo.reclamarArchivo(t3, 600_000))!;
      expect((await repo.reservarTransferencia(lease3, solicitud(t3, 40n * GB))).tipo).toBe("RESERVADA");
      const reservas = await db.reservaTransferenciaZoom.findMany({
        where: { archivoOrigenId: lease1.archivoId }, orderBy: { leaseVersion: "asc" }
      });
      expect(reservas.map((r) => [r.bytesReservados, r.ajustadoBytes, r.bytesConfirmadosInicio])).toEqual([
        [50n * GB, 10n * GB, 0n], [40n * GB, 0n, 10n * GB], [40n * GB, null, 10n * GB]
      ]);
      expect(reservas.reduce((suma, r) => suma + (r.ajustadoBytes ?? r.bytesReservados), 0n)).toBe(50n * GB);
    });

    it("al reservar también se cierran reservas abiertas de leases anteriores (caída entre reclamo y cierre)", async () => {
      const [lease] = await leases(1);
      await db.reservaTransferenciaZoom.create({ data: {
        archivoOrigenId: lease.archivoId, leaseVersion: lease.version - 1, bytesReservados: 50n * GB,
        bytesConfirmadosInicio: 0n, prioridad: "RECIENTE", reservadoAt: reloj
      } });
      expect(await repo.guardarProgreso(lease, { bytesConfirmados: 5n * GB })).toBe(true);
      expect(await repo.reservarTransferencia(lease, { bytes: 45n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES }))
        .toMatchObject({ tipo: "RESERVADA" });
      const anterior = await db.reservaTransferenciaZoom.findFirstOrThrow({ where: { leaseVersion: lease.version - 1 } });
      expect(anterior).toMatchObject({ ajustadoBytes: 5n * GB, liberadoAt: reloj });
    });

    it("la liberación ajusta a bytes transferidos y un lease obsoleto no reserva", async () => {
      const [a, b] = await leases(2);
      const r = await repo.reservarTransferencia(a, { bytes: 50n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES });
      expect(r.tipo).toBe("RESERVADA");
      if (r.tipo !== "RESERVADA") return;
      expect(await repo.liberarReserva(r.reservaId, 10n * GB, reloj)).toBe(true);
      expect(await repo.liberarReserva(r.reservaId, 5n * GB, reloj)).toBe(false);
      expect(await db.reservaTransferenciaZoom.findUniqueOrThrow({ where: { id: r.reservaId } }))
        .toMatchObject({ ajustadoBytes: 10n * GB, liberadoAt: reloj });
      expect(await repo.reservarTransferencia(b, { bytes: 70n * GB, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES }))
        .toMatchObject({ tipo: "RESERVADA" });

      const reasignado = (await repo2.reclamarArchivo(new Date(reloj.getTime() + 601_000), 60_000));
      expect(reasignado?.archivoId).toBeDefined();
      const obsoleto = [a, b].find((l) => l.archivoId === reasignado!.archivoId)!;
      expect(await repo.reservarTransferencia(obsoleto, { bytes: 1n, prioridad: "RECIENTE", ahora: reloj, limites: LIMITES }))
        .toEqual({ tipo: "LEASE_OBSOLETO" });
    });
  });

  it("BarridoArchivoZoom persiste snapshot, cursor cifrado y contador de intentos con defaults seguros", async () => {
    const barrido = await db.barridoArchivoZoom.create({ data: {
      cuentaZoomId: "cuenta-ci", anfitrionesSnapshot: [{ anfitrionZoomId: "host-ci", cuentaProveedorId: null }],
      desde: new Date("2026-01-01"), hasta: new Date("2026-03-31"), solicitanteId: tag
    } });
    expect(barrido).toMatchObject({
      estado: "PENDIENTE", intentos: 0, anfitrionIndice: 0, leaseVersion: 0, nextPageTokenCifrado: null,
      paginasProcesadas: 0, ocurrenciasEncontradas: 0, archivosEncontrados: 0, errorCodigo: null
    });
  });
});
