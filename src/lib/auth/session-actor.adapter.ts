import type { PrismaClient } from "@prisma/client";
import type { RolUsuario } from "@/src/modules/usuarios/roles";

export type SessionActor = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

/**
 * Auth.js and the mobile API issue sessions with a stable internal user ID.
 * Do not recover a missing ID by matching an email address: addresses can be
 * reassigned, so a stale session must never gain access to a different account.
 * Legacy identities require a fresh login to obtain a current user ID.
 */
export async function resolveSessionActor(
  db: PrismaClient,
  identity: Readonly<{ id: string; email?: string | null }>
): Promise<SessionActor | null> {
  if (!identity.id?.trim()) {
    return null;
  }
  return db.usuario.findUnique({
    where: { id: identity.id },
    select: { id: true, rol: true, activo: true }
  });
}
