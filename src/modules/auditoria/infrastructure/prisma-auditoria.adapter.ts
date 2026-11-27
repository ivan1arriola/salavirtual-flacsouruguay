import type { PrismaClient } from "@prisma/client";
import type { EventoAuditoria } from "../domain/auditoria.types";
import type { AuditoriaRepository } from "../ports/auditoria.port";

type PrismaAuditoriaClient = Pick<PrismaClient, "auditoria">;

export function crearPrismaAuditoriaAdapter(
  prismaOrTx: PrismaAuditoriaClient,
): AuditoriaRepository {
  return {
    async registrar(evento: EventoAuditoria): Promise<void> {
      await prismaOrTx.auditoria.create({
        data: {
          accion: evento.accion,
          entidadTipo: evento.entidadTipo,
          entidadId: evento.entidadId,
          actorUsuarioId: evento.actorUsuarioId ?? null,
          valorAnterior: (evento.valorAnterior as any) ?? undefined,
          valorNuevo: (evento.valorNuevo as any) ?? undefined,
          correlacionId: evento.correlacionId ?? null,
          createdAt: evento.timestamp,
        },
      });
    },
  };
}
