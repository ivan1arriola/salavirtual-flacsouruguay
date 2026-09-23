import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { buscarMeet } from "@/src/bootstrap/reverse-meet-search.server";

/** Fachada temporal de compatibilidad. Usar src/bootstrap/reverse-meet-search.server. */
export function searchMeet(
  db: PrismaClient,
  actor: SessionActor | null,
  input: unknown
) {
  return buscarMeet(actor, input, db);
}
