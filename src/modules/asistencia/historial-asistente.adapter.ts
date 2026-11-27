import type { PrismaClient } from "@prisma/client";
import {
  resolverAccionHistorialAsistente,
  type RegistroHistorialAsistenciaPersonal,
} from "./resumen-personal.domain";

function asistenteIdDesdeJson(value: unknown): string | null {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return null;
  }
  const id = (value as Record<string, unknown>)["asistenteTecnicoId"];
  return typeof id === "string" ? id : null;
}

export async function obtenerHistorialAsistenteEnRango(
  db: PrismaClient,
  usuarioId: string,
  rango: Readonly<{ desde?: Date; hasta: Date }>,
): Promise<readonly RegistroHistorialAsistenciaPersonal[]> {
  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId },
    select: { id: true },
  });
  if (!assistant) {
    return [];
  }

  const assignments = await db.asignacionAsistenciaTecnica.findMany({
    where: {
      asistenteTecnicoId: assistant.id,
      instancia: {
        inicioProgramadoAt: {
          ...(rango.desde ? { gte: rango.desde } : {}),
          lt: rango.hasta,
        },
      },
    },
    select: {
      instanciaSalaId: true,
      instancia: {
        select: {
          inicioProgramadoAt: true,
          solicitud: { select: { titulo: true } },
        },
      },
    },
  });
  if (assignments.length === 0) {
    return [];
  }

  const meetingById = new Map(
    assignments.map((assignment) => [
      assignment.instanciaSalaId,
      {
        titulo: assignment.instancia.solicitud.titulo,
        instanciaInicioAt: assignment.instancia.inicioProgramadoAt,
      },
    ]),
  );

  const audits = await db.auditoria.findMany({
    where: {
      entidadTipo: "InstanciaSala",
      entidadId: { in: [...meetingById.keys()] },
      accion: {
        in: ["ASISTENTE_ASIGNADO", "ASISTENTE_REASIGNADO", "ASISTENTE_DESVINCULADO"],
      },
    },
    select: {
      id: true,
      accion: true,
      entidadId: true,
      valorAnterior: true,
      valorNuevo: true,
      createdAt: true,
      actor: { select: { nombres: true, apellidos: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return audits.flatMap<RegistroHistorialAsistenciaPersonal>((audit) => {
    const meeting = meetingById.get(audit.entidadId);
    if (!meeting) {
      return [];
    }
    const accion = resolverAccionHistorialAsistente(
      audit.accion,
      asistenteIdDesdeJson(audit.valorAnterior),
      asistenteIdDesdeJson(audit.valorNuevo),
      assistant.id,
    );
    if (!accion) {
      return [];
    }
    const actor = audit.actor
      ? [audit.actor.nombres, audit.actor.apellidos].filter(Boolean).join(" ") || "Sistema"
      : "Sistema";
    return [
      {
        id: audit.id,
        accion,
        titulo: meeting.titulo,
        instanciaInicioAt: meeting.instanciaInicioAt,
        ocurrioAt: audit.createdAt,
        actor,
      },
    ];
  });
}
