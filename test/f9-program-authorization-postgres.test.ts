import { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { resolveSessionActor } from "../src/lib/auth/session-actor.adapter";
import { puedeGestionarPrograma } from "../src/modules/reuniones/permisos-programa.service";
import { cancelarSolicitudesAtomicas } from "../src/modules/reuniones/cancelar-solicitudes-atomicas.service";

const enabled = process.env.MEET_HISTORY_DATABASE_TEST === "1";
describe.skipIf(!enabled)("F9: aislamiento entre programas en PostgreSQL real", () => {
  const db = new PrismaClient();
  const tag = "f9-" + randomUUID();
  const userA = tag + "-a";
  const userB = tag + "-b";
  const admin = tag + "-admin";
  let programA: string, programB: string;
  let requestA: string, requestB: string;

  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.pathname !== "/flacso_meet_history_ci") {
      throw new Error("F9 requiere PostgreSQL CI aislado; jamás ejecutarlo en producción.");
    }
    await db.usuario.createMany({
      data: [
        { id: userA, nombres: "Docente A", rol: "DOCENTE", emailPrincipal: tag + "-a@example.test" },
        { id: userB, nombres: "Docente B", rol: "DOCENTE", emailPrincipal: tag + "-b@example.test" },
        {
          id: admin,
          nombres: "Administrador",
          rol: "ADMINISTRACION",
          emailPrincipal: tag + "-admin@example.test"
        }
      ]
    });
    const docenteA = await db.docente.create({ data: { usuarioId: userA } });
    const docenteB = await db.docente.create({ data: { usuarioId: userB } });
    const pA = await db.programa.create({ data: { nombre: tag + "-programa-a" } });
    const pB = await db.programa.create({ data: { nombre: tag + "-programa-b" } });
    programA = pA.id;
    programB = pB.id;
    const associationA = await db.docentePrograma.create({
      data: { docenteId: docenteA.id, programaId: programA }
    });
    const associationB = await db.docentePrograma.create({
      data: { docenteId: docenteB.id, programaId: programB }
    });
    const fecha = new Date("2027-10-12T12:00:00Z");
    const data = {
      titulo: tag + " - reunión",
      modalidad: "VIRTUAL" as const,
      tipoInstancias: "UNICA" as const,
      timezone: "America/Montevideo",
      fechaInicioSolicitada: fecha,
      fechaFinSolicitada: new Date(fecha.getTime() + 60 * 60_000)
    };
    requestA = (
      await db.solicitudSala.create({
        data: { ...data, docenteProgramaId: associationA.id, creadaPorUsuarioId: userA }
      })
    ).id;
    requestB = (
      await db.solicitudSala.create({
        data: { ...data, docenteProgramaId: associationB.id, creadaPorUsuarioId: userB }
      })
    ).id;
  }, 20000);

  afterAll(async () => {
    await db.$disconnect();
  });

  it("permite leer el programa propio y deniega uno ajeno", async () => {
    const actorA = await resolveSessionActor(db, { id: userA });
    expect(actorA).not.toBeNull();
    expect(await puedeGestionarPrograma(db, actorA!, programA)).toBe(true);
    expect(await puedeGestionarPrograma(db, actorA!, programB)).toBe(false);
  });

  it("impide cancelar un recurso ajeno y no cambia su estado ni crea auditoría", async () => {
    const actorA = (await resolveSessionActor(db, { id: userA }))!;
    const previous = await db.solicitudSala.findUniqueOrThrow({
      where: { id: requestB },
      select: { estado: true }
    });
    await expect(cancelarSolicitudesAtomicas(db, actorA, [requestB])).rejects.toMatchObject({ status: 403 });
    expect(
      (
        await db.solicitudSala.findUniqueOrThrow({
          where: { id: requestB },
          select: { estado: true }
        })
      ).estado
    ).toBe(previous.estado);
    expect(
      await db.auditoria.count({
        where: {
          accion: "REUNION_ELIMINADA",
          entidadId: requestB
        }
      })
    ).toBe(0);
  });

  it("la cancelación de un encuentro propio sí está autorizada", async () => {
    const actorA = (await resolveSessionActor(db, { id: userA }))!;
    const result = await cancelarSolicitudesAtomicas(db, actorA, [requestA]);
    expect(result.solicitudesCanceladas).toBe(1);
    expect((await db.solicitudSala.findUniqueOrThrow({ where: { id: requestA } })).estado).toBe("CANCELADA");
  });

  it("una sesión con ID antiguo no puede tomar la cuenta de un admin por email", async () => {
    expect(
      await resolveSessionActor(db, {
        id: tag + "-deleted",
        email: tag + "-admin@example.test"
      })
    ).toBeNull();
  });

  it("un docente desactivado no puede administrar su programa", async () => {
    await db.usuario.update({ where: { id: userB }, data: { activo: false } });
    const actorB = (await resolveSessionActor(db, { id: userB }))!;
    expect(actorB.activo).toBe(false);
    expect(await puedeGestionarPrograma(db, actorB, programB)).toBe(false);
    await expect(cancelarSolicitudesAtomicas(db, actorB, [requestB])).rejects.toMatchObject({ status: 403 });
  });

  it("el administrador vigente tiene acceso y una revocación del rol lo quita", async () => {
    const activeAdmin = (await resolveSessionActor(db, { id: admin }))!;
    expect(await puedeGestionarPrograma(db, activeAdmin, programB)).toBe(true);
    await db.usuario.update({ where: { id: admin }, data: { rol: "DOCENTE" } });
    const staleAdmin = (await resolveSessionActor(db, { id: admin }))!;
    expect(staleAdmin.rol).toBe("DOCENTE");
    expect(await puedeGestionarPrograma(db, staleAdmin, programB)).toBe(false);
  });
});
