import { authConfig } from "@/src/lib/auth/config";
import { mobileActorFromRequest, type MobileRole } from "@/src/lib/auth/mobile-token";
import { resolveSessionActor, type SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export class MobileActorError extends Error {
  constructor(
    message: string,
    public readonly status: 401 | 403
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export async function requireMobileActor(
  request: Request,
  allowed: readonly MobileRole[]
): Promise<SessionActor> {
  const token = mobileActorFromRequest(request, authConfig.secret);
  if (!token) {
    throw new MobileActorError("Token móvil ausente o inválido.", 401);
  }

  const actor = await resolveSessionActor(db, { id: token.sub });
  if (!actor || !actor.activo || actor.rol !== token.role) {
    throw new MobileActorError("El acceso móvil fue revocado.", 403);
  }
  if (!allowed.includes(token.role)) {
    throw new MobileActorError("No tenés autorización para acceder a este recurso.", 403);
  }

  return actor;
}
