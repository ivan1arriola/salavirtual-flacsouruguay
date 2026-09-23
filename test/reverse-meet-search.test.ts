import type { PrismaClient } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import { buscarMeet } from "../src/bootstrap/reverse-meet-search.server";
import type { SessionActor } from "../src/lib/auth/session-actor.adapter";
const admin: SessionActor = { id: "admin", rol: "ADMINISTRACION", activo: true };
const current = { id: "e1", instanciaSalaId: "m1", codigoReunion: "jgw-boaw-dgr", joinUrl: "https://meet.google.com/jgw-boaw-dgr" };
const audit = { id: "a1", accion: "MEET_MIGRADO_A_ESPACIO_PREVIEW", entidadTipo: "InstanciaSala",
  entidadId: "m1", createdAt: new Date(), valorAnterior: { codigoReunion: "rsf-wtgp-uxt" },
  valorNuevo: { codigoReunion: "jgw-boaw-dgr" } };
function fixture(events = [current], audits: unknown[] = []) {
  const findMany = vi.fn().mockImplementation(async (query) =>
    query.where.id ? events.filter((e) => query.where.id.in.includes(e.id)).map((e) => ({
      ...e, instancia: { id: e.instanciaSalaId },
    })) : events
  );
  const database = { eventoProveedor: { findMany }, auditoria: { findMany: vi.fn().mockResolvedValue(audits) },
    solicitudSala: { findMany: vi.fn().mockResolvedValue([{ id: "s1", titulo: "Serie" }]) } };
  return { raw: database, db: database as unknown as PrismaClient };
}
describe("búsqueda reversa", () => {
  it.each(["jgw-boaw-dgr", "https://meet.google.com/jgw-boaw-dgr",
    "https://meet.google.com/jgw-boaw-dgr?authuser=1", " JGW - BOAW - DGR "])("busca %s sin historial", async (input) => {
    const { db } = fixture();
    const result = await buscarMeet(admin, input);
    expect(result.results).toHaveLength(1);
    expect(result.results[0].current).toBe(true);
    expect(result.results[0].history).toEqual([]);
    expect(result.multiple).toBe(false);
  });
  it("encuentra el enlace histórico y conserva el vigente", async () => {
    const result = await buscarMeet(fixture([current], [audit]).db, admin, "https://meet.google.com/rsf-wtgp-uxt");
    expect(result.results[0].current).toBe(false);
    expect(result.results[0].currentLinks[0].code).toBe("jgw-boaw-dgr");
    expect(result.results[0].history).toHaveLength(1);
  });
  it("consulta también URLs cuando no hay código y valores legados con espacios", async () => {
    const result = await buscarMeet(fixture([{ ...current, codigoReunion: "", joinUrl: "https://meet.google.com/JGW - BOAW - DGR?authuser=1" }]).db, admin, "jgw-boaw-dgr");
    expect(result.results[0].current).toBe(true);
  });
  it("devuelve vacío para un código inexistente", async () => {
    const { db, raw } = fixture();
    expect((await buscarMeet(admin, "aaa-bbbb-ccc")).results).toEqual([]);
    expect(raw.eventoProveedor.findMany).toHaveBeenCalledTimes(1);
  });
  it("devuelve todas las coincidencias y distingue actuales e históricas", async () => {
    const second = { ...current, id: "e2", instanciaSalaId: "m2", codigoReunion: "rsf-wtgp-uxt", joinUrl: "" };
    const result = await buscarMeet(fixture([current, second], [audit]).db, admin, "rsf-wtgp-uxt");
    expect(result.results).toHaveLength(2);
    expect(result.multiple).toBe(true);
    expect(result.results.map((x) => x.current)).toEqual([false, true]);
  });
  it("detecta código/URL contradictorios", async () => {
    const result = await buscarMeet(fixture([{ ...current, codigoReunion: "rsf-wtgp-uxt" }]).db, admin, "jgw-boaw-dgr");
    expect(result.results[0].inconsistent).toBe(true);
  });
  it("conserva evidencia de serie sin inventar coincidencias individuales", async () => {
    const result = await buscarMeet(fixture([current], [{ ...audit, accion: "ENLACE_MEET_UNIFICADO_EN_SERIE",
      entidadTipo: "SolicitudSala", entidadId: "s1", valorAnterior: { codigosMeet: ["rsf-wtgp-uxt"] },
    }]).db, admin, "rsf-wtgp-uxt");
    expect(result.results).toEqual([]);
    expect(result.series[0].id).toBe("s1");
  });
  it.each([null, { ...admin, activo: false }, { ...admin, rol: "DOCENTE" as const },
    { ...admin, rol: "ASISTENTE_TECNICO" as const }])("rechaza acceso sin consultar datos: %s", async (actor) => {
    const { db, raw } = fixture();
    await expect(buscarMeet(db, actor, "jgw-boaw-dgr")).rejects.toMatchObject({ status: 403 });
    expect(raw.eventoProveedor.findMany).not.toHaveBeenCalled();
    expect(raw.auditoria.findMany).not.toHaveBeenCalled();
  });
  it("rechaza entradas inválidas antes de consultar", async () => {
    const { db, raw } = fixture();
    await expect(buscarMeet(admin, "no es Meet")).rejects.toMatchObject({ status: 400 });
    expect(raw.eventoProveedor.findMany).not.toHaveBeenCalled();
  });
});
