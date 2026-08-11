import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";

export async function cesarAsistenteTecnicoHastaProximoInicioSesion(
  db: PrismaClient,
  actor: SessionActor,
  usuarioId: string
): Promise<void> {
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    throw new Error("Solo Administración puede cesar asistentes técnicos.");
  }

  await db.$transaction(async (tx) => {
    const [actorActual, usuario] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, activo: true, rol: true }
      }),
      tx.usuario.findUnique({
        where: { id: usuarioId },
        select: {
          id: true,
          rol: true,
          asistenteTecnico: {
            select: { id: true, cesadoHastaProximoInicioSesion: true }
          }
        }
      })
    ]);

    if (!actorActual?.activo || actorActual.rol !== "ADMINISTRACION") {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }
    if (!usuario || usuario.rol !== "ASISTENTE_TECNICO" || !usuario.asistenteTecnico) {
      throw new Error("El usuario no corresponde a un asistente técnico.");
    }
    if (usuario.asistenteTecnico.cesadoHastaProximoInicioSesion) return;

    await tx.asistenteTecnico.update({
      where: { id: usuario.asistenteTecnico.id },
      data: { cesadoHastaProximoInicioSesion: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "ASISTENTE_TECNICO_CESADO_HASTA_LOGIN",
        entidadTipo: "AsistenteTecnico",
        entidadId: usuario.asistenteTecnico.id,
        valorAnterior: { cesadoHastaProximoInicioSesion: false },
        valorNuevo: { cesadoHastaProximoInicioSesion: true }
      }
    });
  });
}

export async function registrarInicioSesionUsuario(
  db: PrismaClient,
  usuarioId: string,
  proveedor: "credentials" | "google",
  ahora = new Date()
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuarioId },
      data: { ultimoAccesoAt: ahora, ultimoProveedor: proveedor }
    });
    const reactivados = await tx.asistenteTecnico.updateMany({
      where: {
        usuarioId,
        cesadoHastaProximoInicioSesion: true
      },
      data: { cesadoHastaProximoInicioSesion: false }
    });
    if (reactivados.count === 0) return;

    await tx.auditoria.create({
      data: {
        actorUsuarioId: usuarioId,
        accion: "ASISTENTE_TECNICO_REACTIVADO_POR_LOGIN",
        entidadTipo: "Usuario",
        entidadId: usuarioId,
        valorAnterior: { cesadoHastaProximoInicioSesion: true },
        valorNuevo: { cesadoHastaProximoInicioSesion: false, proveedor }
      }
    });
  });
}
