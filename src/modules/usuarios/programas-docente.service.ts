import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
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
  const { programaIds } = programasDocenteSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const usuario = await tx.usuario.findUnique({
      where: { id: actor.id },
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
    });
    if (!usuario || !puedeGestionarProgramasPropios(usuario)) {
      throw new Error("La sesion ya no corresponde a un docente activo.");
    }

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
        actorUsuarioId: usuario.id,
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
