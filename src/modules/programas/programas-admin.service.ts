import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { programaAdminSchema, puedeAdministrarProgramas } from "./programas-admin.domain";

export async function crearPrograma(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
): Promise<string> {
  if (!puedeAdministrarProgramas(actor)) {
    throw new Error("Solo Administración puede crear programas.");
  }
  const input = programaAdminSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const admin = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!admin || !puedeAdministrarProgramas(admin)) {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }
    await validarNombreDisponible(tx, input.nombre);
    await validarUnidadAcademica(tx, input.unidadAcademicaId);

    const programa = await tx.programa.create({
      data: input,
      select: { id: true, nombre: true, codigo: true, unidadAcademicaId: true, activo: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "PROGRAMA_CREADO",
        entidadTipo: "Programa",
        entidadId: programa.id,
        valorNuevo: programa
      }
    });
    return programa.id;
  });
}

export async function actualizarPrograma(
  db: PrismaClient,
  actor: SessionActor,
  programaId: string,
  rawInput: unknown
): Promise<void> {
  if (!puedeAdministrarProgramas(actor)) {
    throw new Error("Solo Administración puede editar programas.");
  }
  const input = programaAdminSchema.parse(rawInput);

  await db.$transaction(async (tx) => {
    const [admin, anterior] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, rol: true, activo: true }
      }),
      tx.programa.findUnique({
        where: { id: programaId },
        select: { id: true, nombre: true, codigo: true, unidadAcademicaId: true, activo: true }
      })
    ]);
    if (!admin || !puedeAdministrarProgramas(admin)) {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }
    if (!anterior) throw new Error("Programa no encontrado.");

    await validarNombreDisponible(tx, input.nombre, programaId);
    await validarUnidadAcademica(tx, input.unidadAcademicaId);

    const actualizado = await tx.programa.update({
      where: { id: programaId },
      data: input,
      select: { id: true, nombre: true, codigo: true, unidadAcademicaId: true, activo: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "PROGRAMA_ACTUALIZADO",
        entidadTipo: "Programa",
        entidadId: programaId,
        valorAnterior: anterior,
        valorNuevo: actualizado
      }
    });
  });
}

export async function eliminarPrograma(
  db: PrismaClient,
  actor: SessionActor,
  programaId: string,
  confirmacion: string
): Promise<void> {
  if (!puedeAdministrarProgramas(actor)) {
    throw new Error("Solo Administración puede eliminar programas.");
  }
  if (confirmacion !== "ELIMINAR") {
    throw new Error("Escribí ELIMINAR para confirmar la eliminación.");
  }

  await db.$transaction(async (tx) => {
    const [admin, programa, reuniones] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, rol: true, activo: true }
      }),
      tx.programa.findUnique({
        where: { id: programaId },
        select: {
          id: true,
          nombre: true,
          codigo: true,
          unidadAcademicaId: true,
          activo: true,
          legacyZoomProgramaId: true,
          _count: { select: { docentes: true } }
        }
      }),
      tx.solicitudSala.count({
        where: { docentePrograma: { programaId } }
      })
    ]);
    if (!admin || !puedeAdministrarProgramas(admin)) {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }
    if (!programa) throw new Error("Programa no encontrado.");
    if (reuniones > 0) {
      throw new Error(
        "Este programa tiene reuniones asociadas y no puede eliminarse sin perder historial. Marcá el programa como inactivo."
      );
    }

    await tx.docentePrograma.deleteMany({ where: { programaId } });
    await tx.programa.delete({ where: { id: programaId } });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "PROGRAMA_ELIMINADO",
        entidadTipo: "Programa",
        entidadId: programaId,
        valorAnterior: programa,
        valorNuevo: { eliminado: true }
      }
    });
  });
}

async function validarNombreDisponible(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  nombre: string,
  excluirId?: string
): Promise<void> {
  const existente = await tx.programa.findFirst({
    where: {
      nombre: { equals: nombre, mode: "insensitive" },
      ...(excluirId ? { id: { not: excluirId } } : {})
    },
    select: { id: true }
  });
  if (existente) throw new Error("Ya existe un programa con ese nombre.");
}

async function validarUnidadAcademica(
  tx: Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0],
  unidadAcademicaId: string | null
): Promise<void> {
  if (!unidadAcademicaId) return;
  const unidad = await tx.unidadAcademica.findUnique({
    where: { id: unidadAcademicaId },
    select: { id: true }
  });
  if (!unidad) throw new Error("La unidad académica seleccionada no existe.");
}
