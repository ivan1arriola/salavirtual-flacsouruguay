import { Prisma, type PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { ConflictApiError, ForbiddenApiError, NotFoundApiError } from "@/src/lib/http/api-error";
import { idsCancelacionesGooglePendientes } from "./encuentros.domain";
import { puedeGestionarEncuentros } from "./encuentros.domain";
import { puedeGestionarPrograma } from "./permisos-programa.service";
import { bloquearSolicitudSala } from "./reserva-salas.adapter";

/**
 * Cancels all requests of a logical series atomically in PostgreSQL.
 * Google operations are persisted per EventoProveedor and retried separately;
 * no external HTTP calls are performed inside the transaction.
 */
export async function cancelarSolicitudesAtomicas(
  db: PrismaClient,
  actor: SessionActor,
  solicitudIds: readonly string[]
): Promise<Readonly<{ solicitudesCanceladas: number; eventoProveedorIds: readonly string[] }>> {
  const ids = [...new Set(solicitudIds)].sort();
  if (ids.length === 0 || ids.length > 50) {
    throw new ConflictApiError("Una serie debe contener entre 1 y 50 solicitudes.");
  }

  return db.$transaction(
    async (tx) => {
      for (const id of ids) {
        await bloquearSolicitudSala(tx, id);
      }

      const solicitudes = await tx.solicitudSala.findMany({
        where: { id: { in: ids } },
        include: {
          docentePrograma: { select: { programaId: true, docente: { select: { usuarioId: true } } } },
          instancias: {
            include: {
              eventosProveedor: { include: { proveedor: { select: { tipo: true } } } },
              detallesLiquidacion: { select: { id: true } }
            }
          }
        }
      });
      if (solicitudes.length !== ids.length) {
        throw new NotFoundApiError("Una solicitud de la serie no existe.");
      }
      const primera = solicitudes[0];
      if (
        solicitudes.some(
          (solicitud) =>
            solicitud.docenteProgramaId !== primera.docenteProgramaId ||
            solicitud.titulo !== primera.titulo ||
            solicitud.createdAt.getTime() !== primera.createdAt.getTime()
        )
      ) {
        throw new ConflictApiError("Las solicitudes no pertenecen a la misma serie.");
      }

      // Validate all permissions and constraints before changing any record.
      for (const solicitud of solicitudes) {
        if (
          !(await puedeGestionarPrograma(tx, actor, solicitud.docentePrograma.programaId)) ||
          !puedeGestionarEncuentros(actor.rol, actor.id, solicitud.docentePrograma.docente?.usuarioId ?? "")
        ) {
          throw new ForbiddenApiError("No tenés permisos para cancelar toda la serie.");
        }
        if (
          solicitud.estado !== "CANCELADA" &&
          solicitud.instancias.some((instancia) => instancia.detallesLiquidacion.length > 0)
        ) {
          throw new ConflictApiError("La serie contiene liquidaciones y no puede cancelarse.");
        }
      }

      const pending: string[] = [];
      const nuevas = solicitudes.filter((solicitud) => solicitud.estado !== "CANCELADA");
      for (const solicitud of solicitudes) {
        if (solicitud.estado === "CANCELADA") {
          pending.push(...idsCancelacionesGooglePendientes(solicitud.instancias));
          continue;
        }
        const meetIds = solicitud.instancias.flatMap((instancia) =>
          instancia.eventosProveedor
            .filter((evento) => evento.proveedor.tipo === "GOOGLE_MEET" || evento.proveedor.tipo === "ZOOM")
            .map((evento) => evento.id)
        );
        pending.push(...meetIds);
        await tx.auditoria.create({
          data: {
            actorUsuarioId: actor.id,
            accion: "REUNION_ELIMINADA",
            entidadTipo: "SolicitudSala",
            entidadId: solicitud.id,
            valorAnterior: { titulo: solicitud.titulo, encuentros: solicitud.instancias.length },
            valorNuevo: Prisma.JsonNull
          }
        });
        await tx.instanciaSala.updateMany({
          where: { solicitudSalaId: solicitud.id },
          data: { estado: "CANCELADA" }
        });
        if (meetIds.length) {
          await tx.eventoProveedor.updateMany({
            where: { id: { in: meetIds } },
            data: {
              operacionPendiente: "CANCELAR",
              estadoIntegracion: "PENDIENTE",
              reclamoIntegracionAt: null,
              reclamoIntegracionToken: null,
              errorIntegracion: null
            }
          });
        }
        await tx.solicitudSala.update({
          where: { id: solicitud.id },
          data: {
            estado: "CANCELADA",
            canceladaAt: new Date(),
            canceladaMotivo: "Cancelación de serie; enlaces externos pendientes."
          }
        });
      }
      return { solicitudesCanceladas: nuevas.length, eventoProveedorIds: [...new Set(pending)] };
    },
    { maxWait: 10000, timeout: 30000 }
  );
}
