import type { PrismaClient } from "@prisma/client";
import { compare, hash } from "bcryptjs";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { cambioPasswordSchema, perfilPersonalSchema } from "./perfil.domain";

export async function actualizarPerfilPersonal(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!actor.activo) throw new Error("La sesión ya no está activa.");
  const input = perfilPersonalSchema.parse(rawInput);

  return db.$transaction(async (tx) => {
    const anterior = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { nombres: true, apellidos: true, telefono: true, imagenUrl: true, activo: true }
    });
    if (!anterior?.activo) throw new Error("El usuario ya no está activo.");

    const actualizado = await tx.usuario.update({
      where: { id: actor.id },
      data: input,
      select: { nombres: true, apellidos: true, telefono: true, imagenUrl: true }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: "PERFIL_PERSONAL_ACTUALIZADO",
        entidadTipo: "Usuario",
        entidadId: actor.id,
        valorAnterior: anterior,
        valorNuevo: actualizado
      }
    });
    return actualizado;
  });
}

export async function cambiarPasswordPersonal(
  db: PrismaClient,
  actor: SessionActor,
  rawInput: unknown
) {
  if (!actor.activo) throw new Error("La sesión ya no está activa.");
  const input = cambioPasswordSchema.parse(rawInput);
  const usuario = await db.usuario.findUnique({
    where: { id: actor.id },
    select: { passwordHash: true, activo: true }
  });
  if (!usuario?.activo) throw new Error("El usuario ya no está activo.");
  if (usuario.passwordHash) {
    const correcta = await compare(input.passwordActual, usuario.passwordHash);
    if (!correcta) throw new Error("La contraseña actual no es correcta.");
  }

  const passwordHash = await hash(input.passwordNueva, 12);
  return db.$transaction(async (tx) => {
    await tx.usuario.update({
      where: { id: actor.id },
      data: { passwordHash, debeCambiarPassword: false }
    });
    await tx.auditoria.create({
      data: {
        actorUsuarioId: actor.id,
        accion: usuario.passwordHash ? "PASSWORD_PERSONAL_CAMBIADA" : "PASSWORD_PERSONAL_CREADA",
        entidadTipo: "Usuario",
        entidadId: actor.id,
        valorAnterior: { tienePassword: Boolean(usuario.passwordHash) },
        valorNuevo: { tienePassword: true }
      }
    });
  });
}
