import type { PrismaClient } from "@prisma/client";
import type { RolUsuario } from "@/src/modules/usuarios/roles";

export type SessionActor = Readonly<{
  id: string;
  rol: RolUsuario;
  activo: boolean;
}>;

export async function resolveSessionActor(
  db: PrismaClient,
  identity: Readonly<{ id: string; email?: string | null }>
): Promise<SessionActor | null> {
  const byId = await db.usuario.findUnique({
    where: { id: identity.id },
    select: { id: true, rol: true, activo: true }
  });
  if (byId) return byId;

  const email = identity.email?.trim();
  if (!email) return null;

  return db.usuario.findFirst({
    where: { emailPrincipal: { equals: email, mode: "insensitive" } },
    select: { id: true, rol: true, activo: true }
  });
}
