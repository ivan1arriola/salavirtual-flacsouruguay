import type { Prisma } from "@prisma/client";

/**
 * Serializa la elección y reserva de hosts Meet por proveedor. El lock dura lo
 * mismo que la transacción PostgreSQL y evita que dos requests vean la misma
 * capacidad libre antes de insertar sus EventoProveedor.
 */
export async function bloquearReservaSalas(
  tx: Prisma.TransactionClient,
  proveedorId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:salas:${proveedorId}`}))`;
}

/** Serializes structural changes to one meeting series. */
export async function bloquearSolicitudSala(
  tx: Prisma.TransactionClient,
  solicitudId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:solicitud:${solicitudId}`}))`;
}

/** Serializes the short claim phase of an external provider operation. */
export async function bloquearEventoProveedor(
  tx: Prisma.TransactionClient,
  eventoProveedorId: string
): Promise<void> {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`flacso-meet:evento-proveedor:${eventoProveedorId}`}))`;
}
