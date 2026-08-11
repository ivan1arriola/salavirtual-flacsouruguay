import type { Prisma } from "@prisma/client";

/**
 * Serializa las asignaciones de un asistente durante la transacción para que
 * dos solicitudes simultáneas no puedan reservar horarios incompatibles.
 */
export async function bloquearAgendaAsistente(
  tx: Prisma.TransactionClient,
  asistenteTecnicoId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:asistente:${asistenteTecnicoId}`}))`;
}
