import { PrismaClient, type Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { searchMeet } from "../src/modules/meet/reverse-meet-search.service";

const enabled = process.env.MEET_HISTORY_DATABASE_TEST === "1";
describe.skipIf(!enabled)("historial Meet en PostgreSQL real", () => {
  const db = new PrismaClient();
  const tag = randomUUID();
  let requestId: string;
  let providerId: string;
  const actor = { id: tag, rol: "ADMINISTRACION" as const, activo: true };
  beforeAll(async () => {
    // This suite must never run against a tunneled or production database.
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/flacso_meet_history_ci") {
      throw new Error("Esta prueba requiere PostgreSQL CI aislado.");
    }
    await db.usuario.create({ data: { id: tag, nombres: "CI", rol: "ADMINISTRACION" } });
    const docente = await db.docente.create({ data: { usuarioId: tag } });
    const programa = await db.programa.create({ data: { nombre: tag } });
    const dp = await db.docentePrograma.create({ data: { docenteId: docente.id, programaId: programa.id } });
    const provider = await db.proveedorReunion.upsert({
      where: { tipo: "GOOGLE_MEET" }, update: {},
      create: { tipo: "GOOGLE_MEET", nombre: "Meet CI" },
    });
    providerId = provider.id;
    const request = await db.solicitudSala.create({ data: {
      titulo: "Reunión CI", docenteProgramaId: dp.id, creadaPorUsuarioId: tag,
      modalidad: "VIRTUAL", tipoInstancias: "UNICA", timezone: "America/Montevideo",
      fechaInicioSolicitada: new Date(), fechaFinSolicitada: new Date(),
    } });
    requestId = request.id;
  });
  afterAll(async () => { await db.$disconnect(); });

  let ordinal = 0;
  async function event(tx: Prisma.TransactionClient) {
    const instance = await tx.instanciaSala.create({ data: {
      solicitudSalaId: requestId, ordinal: ++ordinal, inicioProgramadoAt: new Date(),
      finProgramadoAt: new Date(), timezone: "America/Montevideo",
    } });
    return tx.eventoProveedor.create({ data: { instanciaSalaId: instance.id, proveedorId: providerId } });
  }

  it("conserva código y URL anteriores en cambios masivos y permite buscarlos", async () => {
    await db.$transaction(async (tx) => {
      const item = await event(tx);
      await tx.$executeRaw`SELECT set_config('flacso.meet_change_origin', 'prueba-ci', true), set_config('flacso.meet_change_reason', 'Migración de prueba', true)`;
      await tx.eventoProveedor.update({ where: { id: item.id }, data: {
        codigoReunion: "rsf-wtgp-uxt", joinUrl: "https://meet.google.com/rsf-wtgp-uxt?authuser=1",
      } });
      await tx.eventoProveedor.updateMany({ where: { id: item.id }, data: {
        codigoReunion: "jgw-boaw-dgr", joinUrl: "https://meet.google.com/jgw-boaw-dgr",
      } });
      const audits = await tx.auditoria.findMany({ where: { entidadId: item.id }, orderBy: { createdAt: "asc" } });
      expect(audits).toHaveLength(2);
      expect(audits[1].valorAnterior).toMatchObject({ codigoReunion: "rsf-wtgp-uxt", joinUrl: "https://meet.google.com/rsf-wtgp-uxt?authuser=1" });
      expect(audits[1].valorNuevo).toMatchObject({ origen: "prueba-ci", motivo: "Migración de prueba" });
      const result = await searchMeet(tx as PrismaClient, actor, "rsf-wtgp-uxt");
      expect(result.results.find((r) => r.event.id === item.id)?.current).toBe(false);
      expect(result.results.find((r) => r.event.id === item.id)?.currentLinks[0].code).toBe("jgw-boaw-dgr");
      // Repeated sync of the same values creates no extra history.
      await tx.eventoProveedor.update({ where: { id: item.id }, data: {
        codigoReunion: "jgw-boaw-dgr", joinUrl: "https://meet.google.com/jgw-boaw-dgr", estadoIntegracion: "SINCRONIZADA",
      } });
      expect(await tx.auditoria.count({ where: { entidadId: item.id } })).toBe(2);
      // Reusing an old code must still be classified as current.
      await tx.eventoProveedor.update({ where: { id: item.id }, data: { codigoReunion: "rsf-wtgp-uxt", joinUrl: null } });
      expect((await searchMeet(tx as PrismaClient, actor, "rsf-wtgp-uxt")).results.find((r) => r.event.id === item.id)?.current).toBe(true);
    });
  });

  it("revierte el historial junto con una transacción fallida", async () => {
    let id = "";
    await expect(db.$transaction(async (tx) => {
      const item = await event(tx); id = item.id;
      await tx.eventoProveedor.update({ where: { id }, data: { codigoReunion: "aaa-bbbb-ccc" } });
      expect(await tx.auditoria.count({ where: { entidadId: id } })).toBe(1);
      throw new Error("rollback esperado");
    })).rejects.toThrow("rollback esperado");
    expect(await db.auditoria.count({ where: { entidadId: id } })).toBe(0);
  });

  it("captura una creación con enlace y su eliminación sin tocar Zoom", async () => {
    await db.$transaction(async (tx) => {
      const item = await event(tx);
      await tx.eventoProveedor.delete({ where: { id: item.id } });
      const created = await tx.eventoProveedor.create({ data: {
        instanciaSalaId: item.instanciaSalaId, proveedorId, codigoReunion: "abc-defg-hij",
      } });
      expect(await tx.auditoria.count({ where: { entidadId: created.id } })).toBe(1);
      await tx.eventoProveedor.update({ where: { id: created.id }, data: { codigoReunion: null } });
      expect(await tx.auditoria.count({ where: { entidadId: created.id } })).toBe(2);
      const zoom = await tx.proveedorReunion.upsert({ where: { tipo: "ZOOM_HISTORICO" }, update: {},
        create: { tipo: "ZOOM_HISTORICO", nombre: "Zoom CI" } });
      const old = await tx.eventoProveedor.create({ data: { instanciaSalaId: item.instanciaSalaId,
        proveedorId: zoom.id, codigoReunion: "123456789", joinUrl: "https://zoom.us/j/123456789" } });
      await tx.eventoProveedor.update({ where: { id: old.id }, data: { codigoReunion: "987654321" } });
      expect(await tx.auditoria.count({ where: { entidadId: old.id } })).toBe(0);
    });
  });
});
