import { ConflictApiError, ForbiddenApiError } from "@/src/lib/http/api-error";
import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { reporteDuracionSchema } from "./asistencia.domain";

export async function reportarDuracionAsistencia(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown,
  ahora = new Date()
) {
  if (!actor.activo || actor.rol !== "ASISTENTE_TECNICO") {
    throw new ForbiddenApiError("Solo un asistente de monitoreo puede informar la duración.");
  }
  const input = reporteDuracionSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const asignacion = await tx.asignacionAsistenciaTecnica.findUnique({
      where: { id: input.asignacionId },
      select: {
        id: true,
        estado: true,
        tarifaHoraAplicada: true,
        moneda: true,
        minutosConfirmados: true,
        montoConfirmado: true,
        instanciaSalaId: true,
        asistenteTecnico: { select: { usuarioId: true } },
        instancia: {
          select: {
            estado: true,
            finProgramadoAt: true,
            inicioRealAt: true,
            finRealAt: true,
            minutosReportados: true,
            comentariosReporte: true
          }
        }
      }
    });
    if (
      !asignacion ||
      asignacion.asistenteTecnico.usuarioId !== actor.id ||
      !["ASIGNADO", "ACEPTADO"].includes(asignacion.estado)
    ) {
      throw new ForbiddenApiError("La reunión no está asignada a este usuario.");
    }
    if (
      asignacion.instancia.estado !== "FINALIZADA" &&
      asignacion.instancia.finProgramadoAt > ahora
    ) {
      throw new ConflictApiError("La duración solo se puede informar al finalizar la reunión.");
    }
    if (["CANCELADA", "NO_REALIZADA"].includes(asignacion.instancia.estado)) {
      throw new ConflictApiError("No se puede informar duración para esta reunión.");
    }

    const minutos = Math.round((input.finReal.getTime() - input.inicioReal.getTime()) / 60_000);
    const monto = asignacion.tarifaHoraAplicada.mul(minutos).div(60);
    const reporte = await tx.instanciaSala.update({
      where: { id: asignacion.instanciaSalaId },
      data: {
        inicioRealAt: input.inicioReal,
        finRealAt: input.finReal,
        minutosReportados: minutos,
        comentariosReporte: input.comentario || null,
        estado: "FINALIZADA"
      },
      select: { id: true, inicioRealAt: true, finRealAt: true, minutosReportados: true, comentariosReporte: true, estado: true }
    });
    await tx.asignacionAsistenciaTecnica.update({
      where: { id: asignacion.id },
      data: { minutosConfirmados: minutos, montoConfirmado: monto }
    });
    const incidencia = input.incidencia
      ? await tx.incidencia.create({
          data: {
            instanciaSalaId: asignacion.instanciaSalaId,
            tipo: input.incidencia.tipo,
            severidad: input.incidencia.severidad,
            descripcion: input.incidencia.descripcion
          },
          select: { id: true, tipo: true, severidad: true }
        })
      : null;
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: asignacion.minutosConfirmados === null
          ? "ASISTENCIA_FINALIZADA"
          : "CIERRE_ASISTENCIA_AJUSTADO",
        entidadTipo: "AsignacionAsistenciaTecnica",
        entidadId: asignacion.id,
        valorAnterior: {
          inicioRealAt: asignacion.instancia.inicioRealAt,
          finRealAt: asignacion.instancia.finRealAt,
          minutosReportados: asignacion.instancia.minutosReportados,
          comentariosReporte: asignacion.instancia.comentariosReporte,
          minutosConfirmados: asignacion.minutosConfirmados,
          montoConfirmado: asignacion.montoConfirmado?.toString() ?? null
        },
        valorNuevo: {
          inicioRealAt: reporte.inicioRealAt,
          finRealAt: reporte.finRealAt,
          minutosReportados: reporte.minutosReportados,
          comentariosReporte: reporte.comentariosReporte,
          minutosConfirmados: minutos,
          montoConfirmado: monto.toString(),
          moneda: asignacion.moneda,
          incidenciaId: incidencia?.id ?? null
        }
      }
    });
    return { ...reporte, minutosConfirmados: minutos, montoConfirmado: monto, moneda: asignacion.moneda, incidencia };
  });
}
