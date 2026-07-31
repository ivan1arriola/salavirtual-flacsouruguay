import type { PrismaClient } from "@prisma/client";
import {
  asignacionAsistenciaSchema,
  estadoInteresParaAccion,
  puedeAsignarAsistencia,
  puedeGestionarPostulacion,
  postulacionAsistenciaSchema
} from "./asistencia.domain";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export async function actualizarPostulacionAsistencia(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeGestionarPostulacion(actor.rol) || !actor.activo) {
    throw new Error("Solo Asistente puede gestionar postulaciones.");
  }
  const input = postulacionAsistenciaSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const assistant = await tx.asistente.findUnique({
      where: { usuarioId: actor.id },
      select: { id: true, usuario: { select: { activo: true, rol: true } } }
    });
    if (!assistant?.usuario.activo || assistant.usuario.rol !== "ASISTENTE") {
      throw new Error("No existe un perfil de Asistente activo para esta sesión.");
    }
    const meeting = await tx.instanciaSala.findUnique({
      where: { id: input.instanciaSalaId },
      select: {
        id: true,
        requiereAsistencia: true,
        finProgramadoAt: true,
        estado: true,
        asignaciones: {
          where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
          select: { id: true },
          take: 1
        }
      }
    });
    if (
      !meeting?.requiereAsistencia ||
      meeting.estado !== "PROGRAMADA" ||
      meeting.finProgramadoAt <= new Date()
    ) {
      throw new Error("La reunión no está abierta para postulaciones.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new Error("La reunión ya tiene una persona asignada.");
    }

    const estado = estadoInteresParaAccion(input.accion);
    const interest = await tx.interesAsistenteEvento.upsert({
      where: {
        instanciaSalaId_asistenteId: {
          instanciaSalaId: meeting.id,
          asistenteId: assistant.id
        }
      },
      create: {
        instanciaSalaId: meeting.id,
        asistenteId: assistant.id,
        estado,
        comentario: input.comentario
      },
      update: { estado, comentario: input.comentario },
      select: { id: true, estado: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: estado === "ME_INTERESA" ? "ASISTENTE_POSTULADO" : "POSTULACION_RETIRADA",
        entidadTipo: "InstanciaSala",
        entidadId: meeting.id,
        valorNuevo: { asistenteId: assistant.id, estado }
      }
    });
    return interest;
  });
}

export async function asignarAsistentePostulado(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new Error("Solo Administracion puede asignar asistentes.");
  }
  const input = asignacionAsistenciaSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const [admin, meeting, assistant, interest] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, activo: true, rol: true }
      }),
      tx.instanciaSala.findUnique({
        where: { id: input.instanciaSalaId },
        select: {
          id: true,
          requiereAsistencia: true,
          finProgramadoAt: true,
          estado: true,
          asignaciones: {
            where: { estado: { in: [...ACTIVE_ASSIGNMENTS] } },
            select: { id: true },
            take: 1
          }
        }
      }),
      tx.asistente.findUnique({
        where: { id: input.asistenteId },
        select: { id: true, usuario: { select: { activo: true, rol: true } } }
      }),
      tx.interesAsistenteEvento.findUnique({
        where: {
          instanciaSalaId_asistenteId: {
            instanciaSalaId: input.instanciaSalaId,
            asistenteId: input.asistenteId
          }
        },
        select: { estado: true }
      })
    ]);
    if (!admin?.activo || !puedeAsignarAsistencia(admin.rol)) {
      throw new Error("La sesión de Administración ya no es válida.");
    }
    if (
      !meeting?.requiereAsistencia ||
      meeting.estado !== "PROGRAMADA" ||
      meeting.finProgramadoAt <= new Date()
    ) {
      throw new Error("La reunión no admite asignaciones.");
    }
    if (meeting.asignaciones.length > 0) {
      throw new Error("La reunión ya tiene una persona asignada.");
    }
    if (!assistant?.usuario.activo || assistant.usuario.rol !== "ASISTENTE") {
      throw new Error("El perfil seleccionado no corresponde a un Asistente activo.");
    }
    if (interest?.estado !== "ME_INTERESA") {
      throw new Error("La persona seleccionada no está postulada a esta reunión.");
    }

    const assignment = await tx.asignacionAsistente.upsert({
      where: {
        instanciaSalaId_asistenteId: {
          instanciaSalaId: meeting.id,
          asistenteId: assistant.id
        }
      },
      create: {
        instanciaSalaId: meeting.id,
        asistenteId: assistant.id,
        estado: "ASIGNADO"
      },
      update: { estado: "ASIGNADO" },
      select: { id: true, estado: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "ASISTENTE_POSTULADO_ASIGNADO",
        entidadTipo: "InstanciaSala",
        entidadId: meeting.id,
        valorNuevo: { asistenteId: assistant.id, estado: assignment.estado }
      }
    });
    return assignment;
  });
}
