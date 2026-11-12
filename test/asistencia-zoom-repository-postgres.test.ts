import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { AsistenciaZoomConsolidada, SesionObservadaZoom } from "../src/modules/archivos/domain";
import { crearPrismaAsistenciaZoomRepositoryAdapter } from "../src/modules/archivos/infrastructure/prisma/prisma-asistencia-zoom-repository.adapter";

const t = (hhmm: string) => new Date(`2026-11-09T${hhmm}:00Z`);
const INICIO = t("10:00");
const FIN = t("11:00");

const sesion = (clave: string, extra: Partial<SesionObservadaZoom> = {}): SesionObservadaZoom => ({
  claveSesion: clave,
  participanteId: "p1",
  userId: "u",
  nombre: "Ana",
  email: "ana@x.com",
  entradaAt: t("10:00"),
  salidaAt: t("10:30"),
  status: "in_meeting",
  rol: null,
  ...extra
});
const resumen = (
  clave: string,
  extra: Partial<AsistenciaZoomConsolidada> = {}
): AsistenciaZoomConsolidada => ({
  claveParticipante: clave,
  nombre: "Ana",
  emailObservado: "ana@x.com",
  minutos: 30,
  porcentaje: 50,
  sesiones: 1,
  primeraEntradaAt: t("10:00"),
  ultimaSalidaAt: t("10:30"),
  esHostOCohost: false,
  claveSesiones: ["s1"],
  estadoConciliacion: "SIN_CONCILIAR",
  ...extra
});

const enabled = process.env.MEET_HISTORY_DATABASE_TEST === "1";

describe.skipIf(!enabled)("repositorio de asistencia Zoom con PostgreSQL real", () => {
  const db = new PrismaClient();
  const repo = crearPrismaAsistenciaZoomRepositoryAdapter({ db });
  const tag = randomUUID();
  let solicitudId = "";
  let eventoId = "";
  let instanciaId = "";

  async function crearOcurrencia(conEvento: boolean) {
    const uuid = `${randomUUID()}/==`;
    const o = await db.ocurrenciaArchivoZoom.create({
      data: {
        cuentaZoomId: "cuenta-ci",
        uuid,
        meetingId: "8123456789",
        anfitrionZoomId: "host-ci",
        inicioRealAt: INICIO,
        titulo: "Clase CI",
        ...(conEvento ? { eventoProveedorId: eventoId } : {})
      }
    });
    return { id: o.id, uuid };
  }

  const version = (uuid: string, evento: string | null) => ({
    uuid,
    eventoProveedorId: evento,
    inicioProgramadoAt: evento ? INICIO : null,
    finProgramadoAt: evento ? FIN : null
  });

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/flacso_meet_history_ci") {
      throw new Error("Esta prueba requiere PostgreSQL CI aislado.");
    }
    await db.usuario.create({ data: { id: tag, nombres: "CI Asistencia Zoom", rol: "ADMINISTRACION" } });
    const docente = await db.docente.create({ data: { usuarioId: tag } });
    const programa = await db.programa.create({ data: { nombre: `prog-${tag}` } });
    const dp = await db.docentePrograma.create({ data: { docenteId: docente.id, programaId: programa.id } });
    const solicitud = await db.solicitudSala.create({
      data: {
        titulo: "Asistencia Zoom CI",
        docenteProgramaId: dp.id,
        creadaPorUsuarioId: tag,
        modalidad: "VIRTUAL",
        tipoInstancias: "MULTIPLE",
        timezone: "America/Montevideo",
        fechaInicioSolicitada: new Date(),
        fechaFinSolicitada: new Date()
      }
    });
    solicitudId = solicitud.id;
    const proveedor = await db.proveedorReunion.upsert({
      where: { tipo: "ZOOM" },
      update: {},
      create: { tipo: "ZOOM", nombre: "ZOOM CI" }
    });
    const instancia = await db.instanciaSala.create({
      data: {
        solicitudSalaId: solicitudId,
        ordinal: 1,
        inicioProgramadoAt: INICIO,
        finProgramadoAt: FIN,
        timezone: "America/Montevideo"
      }
    });
    instanciaId = instancia.id;
    eventoId = (
      await db.eventoProveedor.create({ data: { instanciaSalaId: instancia.id, proveedorId: proveedor.id } })
    ).id;
  });

  beforeEach(async () => {
    await db.registroAsistenciaZoom.deleteMany({});
    await db.sesionAsistenciaZoom.deleteMany({});
    await db.ocurrenciaArchivoZoom.deleteMany({});
  });

  afterAll(async () => {
    await db.registroAsistenciaZoom.deleteMany({});
    await db.sesionAsistenciaZoom.deleteMany({});
    await db.ocurrenciaArchivoZoom.deleteMany({});
    if (solicitudId) {
      await db.solicitudSala.deleteMany({ where: { id: solicitudId } });
    }
    await db.$disconnect();
  });

  it("reintentar el mismo reporte es idempotente: sin sesiones ni registros duplicados", async () => {
    const o = await crearOcurrencia(false);
    const sesiones = [sesion("c1"), sesion("c2", { entradaAt: t("10:40"), salidaAt: t("10:50") })];
    const primero = await repo.guardarSesionesYResumen(o.id, version(o.uuid, null), sesiones, [
      resumen("id:p1")
    ]);
    const segundo = await repo.guardarSesionesYResumen(o.id, version(o.uuid, null), sesiones, [
      resumen("id:p1")
    ]);
    expect(primero).toMatchObject({ tipo: "GUARDADO", sesionesNuevas: 2, registrosCreados: 1 });
    expect(segundo).toMatchObject({
      tipo: "GUARDADO",
      sesionesNuevas: 0,
      registrosCreados: 0,
      registrosActualizados: 1
    });
    expect(await db.sesionAsistenciaZoom.count({ where: { ocurrenciaId: o.id } })).toBe(2);
    expect(await db.registroAsistenciaZoom.count({ where: { ocurrenciaId: o.id } })).toBe(1);
  });

  it("dos ocurrencias del mismo encuentro sincronizadas a la vez: el resumen final ve las sesiones de ambas", async () => {
    const o1 = await crearOcurrencia(true);
    const o2 = await crearOcurrencia(true);
    const consolidar = (
      ambito: ReadonlyArray<{ ocurrenciaId: string; sesiones: readonly SesionObservadaZoom[] }>
    ) => {
      const total = ambito.reduce((n, g) => n + g.sesiones.length, 0);
      return [resumen("id:p1", { sesiones: total })];
    };
    const [r1, r2] = await Promise.all([
      repo.guardarSesionesYConsolidar(o1.id, version(o1.uuid, eventoId), [sesion("c1")], consolidar),
      repo.guardarSesionesYConsolidar(
        o2.id,
        version(o2.uuid, eventoId),
        [sesion("c2", { entradaAt: t("10:40"), salidaAt: t("10:50") })],
        consolidar
      )
    ]);
    expect(r1.tipo).toBe("GUARDADO");
    expect(r2.tipo).toBe("GUARDADO");
    const registros = await db.registroAsistenciaZoom.findMany({
      where: { claveAmbito: `evento:${eventoId}` }
    });
    expect(registros).toHaveLength(1);
    // Serializados por encuentro: la última escritura vio ambas sesiones, nunca una vista obsoleta de una sola.
    expect(registros[0]!.sesiones).toBe(2);
  });

  it("la conciliación, las notas y la versión sobreviven a un nuevo cálculo; un lote vacío no borra nada", async () => {
    const o = await crearOcurrencia(true);
    await repo.guardarSesionesYResumen(o.id, version(o.uuid, eventoId), [sesion("c1")], [resumen("id:p1")]);
    const invitado = await db.invitadoReunion.create({
      data: { instanciaSalaId: instanciaId, email: `${tag}@x.com` }
    });
    await db.registroAsistenciaZoom.updateMany({
      where: { ocurrenciaId: o.id },
      data: {
        estadoConciliacion: "CONCILIADO",
        invitadoReunionId: invitado.id,
        esExterno: false,
        notasOperador: "MANUAL",
        version: 3
      }
    });

    await repo.guardarSesionesYResumen(
      o.id,
      version(o.uuid, eventoId),
      [sesion("c1")],
      [resumen("id:p1", { minutos: 45, porcentaje: 75 })]
    );
    await repo.guardarSesionesYResumen(o.id, version(o.uuid, eventoId), [], []);

    const fila = await db.registroAsistenciaZoom.findFirstOrThrow({ where: { ocurrenciaId: o.id } });
    expect(Number(fila.minutos)).toBe(45);
    expect(Number(fila.porcentaje)).toBe(75);
    expect(fila).toMatchObject({
      claveAmbito: `evento:${eventoId}`,
      estadoConciliacion: "CONCILIADO",
      invitadoReunionId: invitado.id,
      esExterno: false,
      notasOperador: "MANUAL",
      version: 3
    });
    expect(await db.sesionAsistenciaZoom.count({ where: { ocurrenciaId: o.id } })).toBe(1);
  });

  it("una reprogramación concurrente no escribe nada", async () => {
    const o = await crearOcurrencia(true);
    const r = await repo.guardarSesionesYResumen(
      o.id,
      { ...version(o.uuid, eventoId), inicioProgramadoAt: t("09:00") },
      [sesion("c1")],
      [resumen("id:p1")]
    );
    expect(r).toEqual({ tipo: "REPROGRAMADO" });
    expect(await db.sesionAsistenciaZoom.count({})).toBe(0);
    expect(await db.registroAsistenciaZoom.count({})).toBe(0);
  });

  it("no toca la asistencia de Meet", async () => {
    const antes = await db.registroAsistenciaMeet.count({});
    const o = await crearOcurrencia(false);
    await repo.guardarSesionesYResumen(o.id, version(o.uuid, null), [sesion("c1")], [resumen("id:p1")]);
    expect(await db.registroAsistenciaMeet.count({})).toBe(antes);
  });

  it("borrar la ocurrencia elimina sus sesiones y registros (cascada)", async () => {
    const o = await crearOcurrencia(false);
    await repo.guardarSesionesYResumen(o.id, version(o.uuid, null), [sesion("c1")], [resumen("id:p1")]);
    await db.ocurrenciaArchivoZoom.delete({ where: { id: o.id } });
    expect(await db.sesionAsistenciaZoom.count({})).toBe(0);
    expect(await db.registroAsistenciaZoom.count({})).toBe(0);
  });
});
