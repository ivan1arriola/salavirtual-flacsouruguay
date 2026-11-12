import type { PrismaClient } from "@prisma/client";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";

/**
 * La existencia de un JWT no implica que su cuenta siga activa en PostgreSQL.
 * Solo las cuentas vigentes pueden saltarse la pantalla de inicio de sesión.
 * No se recuperan sesiones antiguas mediante el email (F9).
 */
export async function puedeRedirigirAlPanel(
  db: PrismaClient,
  sessionUser: Readonly<{ id: string; email?: string | null }> | null | undefined
): Promise<boolean> {
  if (!sessionUser?.id) {
    return false;
  }
  const actor = await resolveSessionActor(db, sessionUser);
  return actor?.activo === true;
}
