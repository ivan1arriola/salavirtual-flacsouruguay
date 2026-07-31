import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { reporteDuracionSchema } from "./asistencia.domain";

export async function reportarDuracionAsistencia(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown,
  ahora = new Date()
) {
  if (!actor.activo || actor.rol !== "ASISTENTE") {
    throw new Error("Solo Asistente puede informar su duración.");
  }
  const input = reporteDuracionSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const asignacion = await tx.asignacionAsistente.findUnique({
      where: { id: input.asignacionId },
      select: {
        id: true,
        estado: true,
        instanciaSalaId: true,
        asistente: { select: { usuarioId: true } },
        instancia: {
          select: {
            estado: true,
            finProgramadoAt: true,
            minutosReportados: true,
            comentariosReporte: true
          }
        }
      }
    });
    if (
      !asignacion ||
      asignacion.asistente.usuarioId !== actor.id ||
      !["ASIGNADO", "ACEPTADO"].includes(asignacion.estado)
    ) {
      throw new Error("La reunión no está asignada a este usuario.");
    }
    if (
      asignacion.instancia.estado !== "FINALIZADA" &&
      asignacion.instancia.finProgramadoAt > ahora
    ) {
      throw new Error("La duración solo se puede informar al finalizar la reunión.");
    }
    if (["CANCELADA", "NO_REALIZADA"].includes(asignacion.instancia.estado)) {
      throw new Error("No se puede informar duración para esta reunión.");
    }

    const reporte = await tx.instanciaSala.update({
      where: { id: asignacion.instanciaSalaId },
      data: {
        minutosReportados: input.minutos,
        comentariosReporte: input.comentario || null
      },
      select: { id: true, minutosReportados: true, comentariosReporte: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: asignacion.instancia.minutosReportados === null
          ? "DURACION_ASISTENCIA_REPORTADA"
          : "DURACION_ASISTENCIA_AJUSTADA",
        entidadTipo: "InstanciaSala",
        entidadId: asignacion.instanciaSalaId,
        valorAnterior: {
          minutosReportados: asignacion.instancia.minutosReportados,
          comentariosReporte: asignacion.instancia.comentariosReporte
        },
        valorNuevo: {
          minutosReportados: reporte.minutosReportados,
          comentariosReporte: reporte.comentariosReporte
        }
      }
    });
    return reporte;
  });
}
