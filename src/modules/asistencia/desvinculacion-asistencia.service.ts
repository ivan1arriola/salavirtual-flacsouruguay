import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { desvinculacionAsistenciaSchema, puedeAsignarAsistencia } from "./asistencia.domain";

const ACTIVE_ASSIGNMENTS = new Set(["ASIGNADO", "ACEPTADO"]);

export async function desvincularAsistenteAsignado(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!puedeAsignarAsistencia(actor.rol) || !actor.activo) {
    throw new Error("Solo Administración puede desvincular asistentes técnicos.");
  }
  const input = desvinculacionAsistenciaSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const admin = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, activo: true, rol: true }
    });
    if (!admin?.activo || !puedeAsignarAsistencia(admin.rol)) {
      throw new Error("La sesión de Administración ya no es válida.");
    }

    const assignment = await tx.asignacionAsistenciaTecnica.findUnique({
      where: { id: input.asignacionId },
      select: {
        id: true,
        instanciaSalaId: true,
        asistenteTecnicoId: true,
        estado: true,
        detallesLiquidacion: { select: { id: true }, take: 1 },
        asistenteTecnico: {
          select: {
            usuario: {
              select: {
                emailPrincipal: true,
                cuentasGoogle: { select: { id: true } }
              }
            }
          }
        }
      }
    });
    if (!assignment || !ACTIVE_ASSIGNMENTS.has(assignment.estado)) {
      throw new Error("La asignación ya no está activa.");
    }
    if (assignment.detallesLiquidacion.length > 0) {
      throw new Error("No se puede desvincular una asignación incluida en una liquidación.");
    }

    const updated = await tx.asignacionAsistenciaTecnica.update({
      where: { id: assignment.id },
      data: { estado: "CANCELADO" },
      select: { id: true, instanciaSalaId: true, estado: true }
    });

    const googleIds = assignment.asistenteTecnico.usuario.cuentasGoogle.map(({ id }) => id);
    if (googleIds.length > 0) {
      await tx.cohostReunion.deleteMany({
        where: {
          instanciaSalaId: assignment.instanciaSalaId,
          cuentaGoogleId: { in: googleIds }
        }
      });
    }
    if (assignment.asistenteTecnico.usuario.emailPrincipal) {
      await tx.cohostEmailReunion.deleteMany({
        where: {
          instanciaSalaId: assignment.instanciaSalaId,
          email: assignment.asistenteTecnico.usuario.emailPrincipal.toLowerCase()
        }
      });
    }

    await tx.auditoria.create({
      data: {
        actorUsuarioId: admin.id,
        accion: "ASISTENTE_DESVINCULADO",
        entidadTipo: "InstanciaSala",
        entidadId: assignment.instanciaSalaId,
        valorAnterior: {
          asistenteTecnicoId: assignment.asistenteTecnicoId,
          estado: assignment.estado
        },
        valorNuevo: {
          asistenteTecnicoId: assignment.asistenteTecnicoId,
          estado: "CANCELADO"
        }
      }
    });

    return updated;
  });
}
