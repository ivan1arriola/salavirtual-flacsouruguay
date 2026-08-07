import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { completarRegistroInstitucionalSchema } from "./registro-institucional.domain";

export async function completarRegistroInstitucional(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<string> {
  if (!actor.activo || actor.rol !== "DOCENTE") {
    throw new Error("Solo un docente activo puede completar este registro.");
  }
  const input = completarRegistroInstitucionalSchema.parse(rawInput);
  return db.$transaction(async (tx) => {
    const user = await tx.usuario.findUnique({
      where: { id: actor.id },
      include: { docente: { select: { id: true } } }
    });
    if (!user?.activo || user.rol !== "DOCENTE") {
      throw new Error("La sesión ya no corresponde a un docente activo.");
    }
    const docente = user.docente ?? await tx.docente.create({
      data: { usuarioId: user.id },
      select: { id: true }
    });
    const programa = input.programaId
      ? await tx.programa.findFirst({
          where: { id: input.programaId, activo: true },
          select: { id: true, nombre: true }
        })
      : await encontrarOCrearPrograma(tx, input.programaNuevo!);
    if (!programa) throw new Error("El programa seleccionado no existe o está inactivo.");

    await tx.docentePrograma.upsert({
      where: { docenteId_programaId: { docenteId: docente.id, programaId: programa.id } },
      create: { docenteId: docente.id, programaId: programa.id, activo: true },
      update: { activo: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: user.id,
        accion: "REGISTRO_INSTITUCIONAL_COMPLETADO",
        entidadTipo: "Docente",
        entidadId: docente.id,
        valorNuevo: { programaId: programa.id, programaNombre: programa.nombre }
      }
    });
    return programa.id;
  });
}

type TransactionClient = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

async function encontrarOCrearPrograma(tx: TransactionClient, nombre: string) {
  const existing = await tx.programa.findFirst({
    where: { nombre: { equals: nombre, mode: "insensitive" } },
    select: { id: true, nombre: true, activo: true }
  });
  if (existing && !existing.activo) throw new Error("Ya existe un programa inactivo con ese nombre.");
  if (existing) return existing;
  return tx.programa.create({
    data: { nombre, activo: true },
    select: { id: true, nombre: true }
  });
}
