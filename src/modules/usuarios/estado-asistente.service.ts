import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";

export type EstadoOperativoAsistenteInput = Readonly<{
  disponibleGeneral?: boolean;
  cesadoHastaProximoInicioSesion?: boolean;
}>;

export async function actualizarEstadoOperativoAsistente(
  db: PrismaClient,
  actor: SessionActor,
  usuarioId: string,
  input: EstadoOperativoAsistenteInput,
): Promise<
  Readonly<{
    disponibleGeneral: boolean;
    cesadoHastaProximoInicioSesion: boolean;
  }>
> {
  if (!actor.activo || actor.rol !== "ADMINISTRACION") {
    throw new Error("Solo Administración puede gestionar asistentes de monitoreo.");
  }
  if (
    typeof input.disponibleGeneral !== "boolean" &&
    typeof input.cesadoHastaProximoInicioSesion !== "boolean"
  ) {
    throw new Error("No se indicó ningún cambio operativo.");
  }

  return db.$transaction(async (tx) => {
    const [actorActual, usuario] = await Promise.all([
      tx.usuario.findUnique({
        where: { id: actor.id },
        select: { id: true, activo: true, rol: true },
      }),
      tx.usuario.findUnique({
        where: { id: usuarioId },
        select: {
          id: true,
          rol: true,
          asistenteTecnico: {
            select: {
              id: true,
              disponibleGeneral: true,
              cesadoHastaProximoInicioSesion: true,
            },
          },
        },
      }),
    ]);

    if (!actorActual?.activo || actorActual.rol !== "ADMINISTRACION") {
      throw new Error("La sesión ya no tiene permisos de Administración.");
    }
    if (!usuario || usuario.rol !== "ASISTENTE_TECNICO" || !usuario.asistenteTecnico) {
      throw new Error("El usuario no corresponde a un asistente de monitoreo.");
    }

    const anterior = {
      disponibleGeneral: usuario.asistenteTecnico.disponibleGeneral,
      cesadoHastaProximoInicioSesion: usuario.asistenteTecnico.cesadoHastaProximoInicioSesion,
    };
    const siguiente = {
      disponibleGeneral: input.disponibleGeneral ?? anterior.disponibleGeneral,
      cesadoHastaProximoInicioSesion:
        input.cesadoHastaProximoInicioSesion ?? anterior.cesadoHastaProximoInicioSesion,
    };

    if (
      anterior.disponibleGeneral === siguiente.disponibleGeneral &&
      anterior.cesadoHastaProximoInicioSesion === siguiente.cesadoHastaProximoInicioSesion
    ) {
      return siguiente;
    }

    await tx.asistenteTecnico.update({
      where: { id: usuario.asistenteTecnico.id },
      data: {
        ...(typeof input.disponibleGeneral === "boolean"
          ? { disponibleGeneral: input.disponibleGeneral }
          : {}),
        ...(typeof input.cesadoHastaProximoInicioSesion === "boolean"
          ? { cesadoHastaProximoInicioSesion: input.cesadoHastaProximoInicioSesion }
          : {}),
      },
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "ASISTENTE_TECNICO_ESTADO_OPERATIVO_ACTUALIZADO",
        entidadTipo: "AsistenteTecnico",
        entidadId: usuario.asistenteTecnico.id,
        valorAnterior: anterior,
        valorNuevo: siguiente,
      },
    });

    return siguiente;
  });
}

export async function cesarAsistenteTecnicoHastaProximoInicioSesion(
  db: PrismaClient,
  actor: SessionActor,
  usuarioId: string,
): Promise<void> {
  await actualizarEstadoOperativoAsistente(db, actor, usuarioId, {
    cesadoHastaProximoInicioSesion: true,
  });
}

export async function reactivarAsistenteTecnicoAhora(
  db: PrismaClient,
  actor: SessionActor,
  usuarioId: string,
): Promise<void> {
  await actualizarEstadoOperativoAsistente(db, actor, usuarioId, {
    cesadoHastaProximoInicioSesion: false,
  });
}

export async function registrarInicioSesionUsuario(
  db: PrismaClient,
  usuarioId: string,
  proveedor: "credentials" | "google",
  ahora = new Date(),
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: usuarioId },
      data: { ultimoAccesoAt: ahora, ultimoProveedor: proveedor },
    });
    const reactivados = await tx.asistenteTecnico.updateMany({
      where: {
        usuarioId,
        cesadoHastaProximoInicioSesion: true,
      },
      data: { cesadoHastaProximoInicioSesion: false },
    });
    if (reactivados.count === 0) {
      return;
    }

    await tx.auditoria.create({
      data: {
        actorUsuarioId: usuarioId,
        accion: "ASISTENTE_TECNICO_REACTIVADO_POR_LOGIN",
        entidadTipo: "Usuario",
        entidadId: usuarioId,
        valorAnterior: { cesadoHastaProximoInicioSesion: true },
        valorNuevo: { cesadoHastaProximoInicioSesion: false, proveedor },
      },
    });
  });
}
