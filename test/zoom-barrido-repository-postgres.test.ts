import { randomUUID } from "node:crypto";
import { PrismaClient, type Prisma } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cifrarConfiguracion, descifrarConfiguracion } from "../src/lib/config/encryption";
import { crearPrismaZoomBarridoRepositoryAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-zoom-barrido-repository.adapter";
import type { BarridoZoomRepositoryPort, EstadoBarridoZoom } from "../src/modules/archivos/ports/zoom-barrido-repository.port";

const enabled = process.env.MEET_HISTORY_DATABASE_TEST === "1";
const AHORA = new Date("2026-11-09T12:00:00Z");
const antes = new Date(AHORA.getTime() - 1);
const despues = new Date(AHORA.getTime() + 60_000);
const TOKEN = "zoom-next-page-token-secreto/+=123";

describe.skipIf(!enabled)("repositorio de barridos Zoom con PostgreSQL real", () => {
  let db: PrismaClient;
  let db2: PrismaClient;
  let repo: BarridoZoomRepositoryPort;
  let repo2: BarridoZoomRepositoryPort;
  const tag = randomUUID();
  const nuevo = {
    cuentaZoomId: `barrido-ci-${tag}`,
    anfitriones: [
      { anfitrionZoomId: "host-1", cuentaProveedorId: null },
      { anfitrionZoomId: "host-2", cuentaProveedorId: "cuenta-2" }
    ],
    desde: "2026-01-01", hasta: "2026-03-31", solicitanteId: tag
  };

  async function limpiar() {
    await db.auditoria.deleteMany({ where: { actorUsuarioId: tag, entidadTipo: "BarridoArchivoZoom" } });
    await db.barridoArchivoZoom.deleteMany({ where: { cuentaZoomId: nuevo.cuentaZoomId } });
  }

  async function crear(data: Prisma.BarridoArchivoZoomUpdateInput = {}) {
    const { id } = await repo.crear(nuevo);
    await db.barridoArchivoZoom.update({ where: { id }, data });
    return id;
  }

  async function reclamar(id: string, ahora = AHORA) {
    const reclamado = await repo.reclamar(id, ahora, 60_000);
    expect(reclamado).not.toBeNull();
    return reclamado!.lease;
  }

  beforeAll(async () => {
    // No cargar .env: la URL debe ser explícita y pertenecer a la base descartable de CI.
    const url = new URL(process.env.DATABASE_URL ?? "");
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/flacso_meet_history_ci") {
      throw new Error("Esta prueba requiere PostgreSQL CI aislado.");
    }
    db = new PrismaClient({ datasourceUrl: url.toString() });
    db2 = new PrismaClient({ datasourceUrl: url.toString() });
    const cifrado = { cifrar: cifrarConfiguracion, descifrar: descifrarConfiguracion };
    repo = crearPrismaZoomBarridoRepositoryAdapter({ db, ...cifrado });
    repo2 = crearPrismaZoomBarridoRepositoryAdapter({ db: db2, ...cifrado });
    await Promise.all([db.$connect(), db2.$connect()]);
    await db.usuario.create({ data: { id: tag, nombres: "CI Barrido Zoom", rol: "ADMINISTRACION" } });
  });

  beforeEach(limpiar);

  afterAll(async () => {
    if (!db) return;
    try {
      await limpiar();
      await db.usuario.deleteMany({ where: { id: tag } });
    } finally {
      await Promise.all([db.$disconnect(), db2.$disconnect()]);
    }
  });

  it("crear conserva el snapshot y registra ZOOM_RECUPERACION_CREADA en Auditoria", async () => {
    const { id } = await repo.crear(nuevo);
    expect(await repo.obtener(id)).toEqual({
      id, cuentaZoomId: nuevo.cuentaZoomId, anfitriones: nuevo.anfitriones,
      desde: nuevo.desde, hasta: nuevo.hasta,
      posicion: { anfitrionIndice: 0, fuente: "ACTIVAS" as const, ventanaDesde: null, cursor: null },
      estado: "PENDIENTE", paginasProcesadas: 0, ocurrenciasEncontradas: 0,
      intentos: 0, errorCodigo: null, omisiones: [], completadoAt: null
    });
    expect(await db.auditoria.findMany({ where: { entidadTipo: "BarridoArchivoZoom", entidadId: id } }))
      .toEqual([expect.objectContaining({
        actorUsuarioId: tag, accion: "ZOOM_RECUPERACION_CREADA",
        valorNuevo: { desde: nuevo.desde, hasta: nuevo.hasta, anfitriones: 2 }
      })]);
    expect(await repo.obtener(randomUUID())).toBeNull();
  });

  it.each<EstadoBarridoZoom>(["PENDIENTE", "ERROR_REINTENTABLE", "EN_CURSO"])(
    "reclamar acepta %s vencido e incrementa la versión", async (estado) => {
      const id = await crear({ estado, proximoIntentoAt: AHORA, leaseHasta: antes, leaseVersion: 4 });
      const lease = await reclamar(id);
      expect(lease).toEqual({ barridoId: id, version: 5, venceAt: despues });
      expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } }))
        .toMatchObject({ estado: "EN_CURSO", leaseVersion: 5, leaseHasta: despues, intentos: 0 });
    }
  );

  it.each<EstadoBarridoZoom>(["COMPLETADO", "REQUIERE_REVISION", "CANCELADO"])(
    "reclamar rechaza %s sin modificar la fila", async (estado) => {
      const id = await crear({ estado });
      const fila = await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } });
      expect(await repo.reclamar(id, AHORA, 60_000)).toBeNull();
      expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toEqual(fila);
    }
  );

  it("reclamar respeta el próximo intento y el lease vigente, incluso en el límite", async () => {
    for (const data of [
      { estado: "ERROR_REINTENTABLE" as const, proximoIntentoAt: despues },
      { estado: "EN_CURSO" as const, leaseHasta: despues },
      { estado: "EN_CURSO" as const, leaseHasta: AHORA }
    ]) {
      const id = await crear(data);
      const fila = await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } });
      expect(await repo.reclamar(id, AHORA, 60_000)).toBeNull();
      expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toEqual(fila);
    }
  });

  it("dos clientes reclaman simultáneamente: solo uno obtiene el lease", async () => {
    const id = await crear();
    const resultados = await Promise.all([
      repo.reclamar(id, AHORA, 60_000), repo2.reclamar(id, AHORA, 60_000)
    ]);
    expect(resultados.filter(Boolean)).toHaveLength(1);
    expect(resultados.filter((r) => r === null)).toHaveLength(1);
    expect(resultados.find(Boolean)?.lease).toEqual({ barridoId: id, version: 1, venceAt: despues });
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } }))
      .toMatchObject({ estado: "EN_CURSO", leaseVersion: 1, leaseHasta: despues });
  });

  it("avanzar rechaza un lease reemplazado sin cambiar ningún campo", async () => {
    const id = await crear();
    const obsoleto = await reclamar(id);
    const vigente = await reclamar(id, new Date(despues.getTime() + 1));
    expect(vigente.version).toBe(obsoleto.version + 1);
    const fila = await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } });
    for (const siguiente of [null, { anfitrionIndice: 1, fuente: "ACTIVAS" as const, ventanaDesde: "2026-02-01", cursor: TOKEN }]) {
      expect(await repo.avanzar(obsoleto, { siguiente, ocurrencias: 99, omision: { anfitrionZoomId: "h", codigo: "NO_APLICAR" } }, AHORA)).toBe(false);
      expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toEqual(fila);
    }
    expect(await repo.registrarFallo(obsoleto, { tipo: "REVISION", codigo: "NO_APLICAR", proximoIntentoAt: null })).toBe(false);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toEqual(fila);
  });

  it("avanzar cifra el cursor, lo descifra al leer y completa con siguiente=null", async () => {
    const id = await crear({ intentos: 2, proximoIntentoAt: antes });
    const lease = await reclamar(id);
    const siguiente = { anfitrionIndice: 1, fuente: "ACTIVAS" as const, ventanaDesde: "2026-02-01", cursor: TOKEN };
    expect(await repo.avanzar(lease, { siguiente, ocurrencias: 3 }, AHORA)).toBe(true);
    const fila = await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } });
    expect(fila.nextPageTokenCifrado).toMatch(/^v1:/);
    expect(fila.nextPageTokenCifrado).not.toContain(TOKEN);
    expect(fila).toMatchObject({
      estado: "PENDIENTE", paginasProcesadas: 1, ocurrenciasEncontradas: 3,
      intentos: 0, proximoIntentoAt: null, leaseHasta: null, completadoAt: null
    });
    expect(await repo.obtener(id)).toMatchObject({ posicion: siguiente });
    const segundo = await repo2.reclamar(id, AHORA, 60_000);
    expect(segundo?.barrido.posicion).toEqual(siguiente);
    expect(await repo.avanzar(segundo!.lease, { siguiente: null, ocurrencias: 2 }, despues)).toBe(true);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toMatchObject({
      estado: "COMPLETADO", paginasProcesadas: 2, ocurrenciasEncontradas: 5,
      nextPageTokenCifrado: null, leaseHasta: null, completadoAt: despues
    });
    expect(await repo.avanzar(segundo!.lease, { siguiente: null, ocurrencias: 2 }, despues)).toBe(false);
  });

  it("avanzar con conservarIntentos no reinicia los intentos; sin él, sí", async () => {
    const id = await crear({ intentos: 2, proximoIntentoAt: antes });
    const lease = await reclamar(id);
    const siguiente = { anfitrionIndice: 0, fuente: "ACTIVAS" as const, ventanaDesde: "2026-01-01", cursor: TOKEN };
    expect(await repo.avanzar(lease, { siguiente, ocurrencias: 1, conservarIntentos: true }, AHORA)).toBe(true);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toMatchObject({ intentos: 2 });
    const lease2 = await reclamar(id, despues);
    expect(await repo.avanzar(lease2, { siguiente: { ...siguiente, cursor: null }, ocurrencias: 1 }, despues)).toBe(true);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toMatchObject({ intentos: 0 });
  });

  it("un anfitrión omitido se registra y el barrido termina en REQUIERE_REVISION, no COMPLETADO", async () => {
    const id = await crear();
    const lease = await reclamar(id);
    expect(await repo.avanzar(lease, { siguiente: null, ocurrencias: 0, omision: { anfitrionZoomId: "host-1", codigo: "SOLICITUD_RECHAZADA:404:z1001" } }, AHORA)).toBe(true);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toMatchObject({
      estado: "REQUIERE_REVISION", completadoAt: AHORA, leaseHasta: null
    });
    expect((await repo.obtener(id))?.omisiones).toEqual(["host-1:SOLICITUD_RECHAZADA:404:z1001"]);
  });

  it("registrarFallo acumula intentos y exige revisión al alcanzar el límite", async () => {
    const id = await crear();
    const lease = await reclamar(id);
    const fallo = { tipo: "REINTENTABLE" as const, codigo: "ZOOM_429", proximoIntentoAt: despues, limiteIntentos: 2 };
    expect(await repo.registrarFallo(lease, fallo)).toBe(true);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toMatchObject({
      estado: "ERROR_REINTENTABLE", intentos: 1, errorCodigo: "ZOOM_429", proximoIntentoAt: despues, leaseHasta: null
    });
    expect(await repo.reclamar(id, AHORA, 60_000)).toBeNull();
    const segundo = await reclamar(id, despues);
    expect(await repo.registrarFallo(segundo, fallo)).toBe(true);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toMatchObject({
      estado: "REQUIERE_REVISION", intentos: 2, proximoIntentoAt: null, leaseHasta: null
    });
  });

  it("registrarFallo con REVISION cierra inmediatamente aunque no alcance el límite", async () => {
    const id = await crear();
    expect(await repo.registrarFallo(await reclamar(id), {
      tipo: "REVISION", codigo: "ZOOM_PERMISOS", proximoIntentoAt: despues, limiteIntentos: 10
    })).toBe(true);
    expect(await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).toMatchObject({
      estado: "REQUIERE_REVISION", intentos: 1, errorCodigo: "ZOOM_PERMISOS", proximoIntentoAt: null, leaseHasta: null
    });
  });

  it.each([false, true])("registrarFallo reiniciarCursor=%s conserva o limpia el token", async (reiniciarCursor) => {
    const id = await crear();
    const posicion = { anfitrionIndice: 1, fuente: "ACTIVAS" as const, ventanaDesde: "2026-02-01", cursor: TOKEN };
    await repo.avanzar(await reclamar(id), { siguiente: posicion, ocurrencias: 1 }, AHORA);
    const cifrado = (await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).nextPageTokenCifrado;
    expect(await repo.registrarFallo(await reclamar(id), {
      tipo: "REINTENTABLE", codigo: "CURSOR_VENCIDO", proximoIntentoAt: despues, reiniciarCursor
    })).toBe(true);
    expect((await db.barridoArchivoZoom.findUniqueOrThrow({ where: { id } })).nextPageTokenCifrado)
      .toBe(reiniciarCursor ? null : cifrado);
    expect(await repo.obtener(id)).toMatchObject({ posicion: { ...posicion, cursor: reiniciarCursor ? null : TOKEN } });
  });

  it("listarPendientes incluye solo estados y vencimientos elegibles y respeta el límite", async () => {
    const casos: { estado: EstadoBarridoZoom; proximoIntentoAt?: Date; leaseHasta?: Date; incluido: boolean }[] = [
      { estado: "PENDIENTE", incluido: true },
      { estado: "ERROR_REINTENTABLE", proximoIntentoAt: antes, incluido: true },
      { estado: "ERROR_REINTENTABLE", proximoIntentoAt: AHORA, incluido: true },
      { estado: "ERROR_REINTENTABLE", incluido: true },
      { estado: "EN_CURSO", leaseHasta: antes, incluido: true },
      { estado: "EN_CURSO", incluido: true },
      { estado: "ERROR_REINTENTABLE", proximoIntentoAt: despues, incluido: false },
      { estado: "EN_CURSO", leaseHasta: despues, incluido: false },
      { estado: "EN_CURSO", leaseHasta: AHORA, incluido: false },
      { estado: "COMPLETADO", incluido: false },
      { estado: "REQUIERE_REVISION", incluido: false },
      { estado: "CANCELADO", incluido: false }
    ];
    const ids: string[] = [];
    for (const [i, { incluido: _, ...data }] of casos.entries()) {
      ids.push(await crear({ ...data, createdAt: new Date(Date.UTC(2000, 0, 1, 0, 0, i)) }));
    }
    const pendientes = await repo.listarPendientes(AHORA, 1000);
    for (const [i, caso] of casos.entries()) expect(pendientes.includes(ids[i])).toBe(caso.incluido);
    expect(pendientes.filter((id) => ids.includes(id))).toEqual(ids.filter((_, i) => casos[i].incluido));
    expect(await repo.listarPendientes(AHORA, 1)).toEqual([ids[0]]);
  });
});
