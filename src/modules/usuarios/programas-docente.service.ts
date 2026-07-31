import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  puedeGestionarProgramasDocente,
  puedeGestionarProgramasPropios,
  programasDocenteSchema
} from "./programas-docente.domain";

export async function actualizarProgramasPropios(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<readonly string[]> {
  if (!puedeGestionarProgramasPropios(actor)) {
    throw new Error("Solo los docentes pueden gestionar sus programas.");
  }
  return actualizarProgramasDocente(db, actor, actor.id, rawInput);
}

export async function actualizarProgramasDocente(
  db: PrismaClient,
  actor: SessionActor,
  docenteUsuarioId: string,
  rawInput: unknown
): Promise<readonly string[]> {
  if (!puedeGestionarProgramasDocente(actor, docenteUsuarioId)) {
    throw new Error("No tenes permisos para gestionar los programas de este docente.");
  }
  const { programaIds } = programasDocenteSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const [actorActual, usuario] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, rol: true, activo: true }
      }),
      tx.usuario.findUnique({
        where: { id: docenteUsuarioId },
        select: {
          id: true,
          rol: true,
          activo: true,
          docente: {
            select: {
              id: true,
              programas: { where: { activo: true }, select: { programaId: true } }
            }
          }
        }
      })
    ]);
    if (!actorActual || !puedeGestionarProgramasDocente(actorActual, docenteUsuarioId)) {
      throw new Error("La sesion ya no tiene permisos para gestionar estos programas.");
    }
    if (!usuario || usuario.rol !== "DOCENTE") throw new Error("El usuario no es docente.");

    const programasValidos = await tx.programa.count({
      where: { id: { in: programaIds }, activo: true }
    });
    if (programasValidos !== programaIds.length) {
      throw new Error("Uno o mas programas no existen o ya no estan activos.");
    }

    const docente = usuario.docente ?? await tx.docente.create({
      data: { usuarioId: usuario.id },
      select: { id: true, programas: { select: { programaId: true } } }
    });
    const anteriores = usuario.docente?.programas.map(({ programaId }) => programaId) ?? [];

    await tx.docentePrograma.updateMany({
      where: { docenteId: docente.id, activo: true, programaId: { notIn: programaIds } },
      data: { activo: false }
    });
    for (const programaId of programaIds) {
      await tx.docentePrograma.upsert({
        where: { docenteId_programaId: { docenteId: docente.id, programaId } },
        create: { docenteId: docente.id, programaId, activo: true },
        update: { activo: true }
      });
    }

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "PROGRAMAS_DOCENTE_ACTUALIZADOS",
        entidadTipo: "Docente",
        entidadId: docente.id,
        valorAnterior: { programaIds: anteriores },
        valorNuevo: { programaIds }
      }
    });
    return programaIds;
  });
}
