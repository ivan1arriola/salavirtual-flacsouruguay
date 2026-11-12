import type { Prisma, PrismaClient } from "@prisma/client";
import { assistantSlug } from "../../lib/ui/assistant-route";

type AssistantSlugDb = PrismaClient | Prisma.TransactionClient;

export async function crearSlugAsistenteDisponible(
  db: AssistantSlugDb,
  name: string,
  userId: string
): Promise<string> {
  const base = assistantSlug(name);
  const existing = await db.asistenteTecnico.findUnique({
    where: { slug: base },
    select: { usuarioId: true }
  });
  if (!existing || existing.usuarioId === userId) {
    return base;
  }
  return `${base}--${assistantSlug(userId)}`;
}
