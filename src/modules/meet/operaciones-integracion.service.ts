import type { PrismaClient } from "@prisma/client";
import { recalcularSolicitud } from "../reuniones/encuentros-persistence.adapter";

export type DescartarOperacionResult = Readonly<{
  eventoProveedorId: string;
  descartada: boolean;
  motivo?: string;
}>;

export type DescartarLoteResult = Readonly<{
  totalDescartadas: number;
}>;

export type ReclasificarLoteResult = Readonly<{
  totalReclasificadas: number;
}>;

/**
 * Descarta una operación pendiente individual si la reunión ya cuenta con enlace Meet
 * o si el administrador decide deliberadamente quitar la tarea técnica de la cola.
 */
export async function descartarOperacionPendiente(
  db: PrismaClient,
  eventoProveedorId: string
): Promise<DescartarOperacionResult> {
  return db.$transaction(async (tx) => {
    const event = await tx.eventoProveedor.findUnique({
      where: { id: eventoProveedorId },
      select: {
        id: true,
        joinUrl: true,
        codigoReunion: true,
        operacionPendiente: true,
        estadoIntegracion: true,
        instancia: {
          select: {
            solicitudSalaId: true,
            estado: true
          }
        }
      }
    });

    if (!event) {
      return { eventoProveedorId, descartada: false, motivo: "El evento no existe." };
    }

    if (!event.operacionPendiente) {
      return { eventoProveedorId, descartada: false, motivo: "El evento no tiene operación pendiente." };
    }

    const hasMeet = Boolean(event.joinUrl || event.codigoReunion);

    await tx.eventoProveedor.update({
      where: { id: eventoProveedorId },
      data: {
        operacionPendiente: null,
        reclamoIntegracionAt: null,
        reclamoIntegracionToken: null,
        errorIntegracion: null,
        estadoIntegracion: hasMeet ? "SINCRONIZADA" : event.estadoIntegracion
      }
    });

    if (event.instancia && event.instancia.estado !== "CANCELADA") {
      await recalcularSolicitud(tx, event.instancia.solicitudSalaId);
    }

    return { eventoProveedorId, descartada: true };
  });
}

/**
 * Descarta en lote todas las operaciones técnicas pendientes no bloqueantes
 * (aquellas reuniones que ya tienen enlace Meet generado y cuyo único pendiente
 * eran ajustes avanzados como cohosts o moderación por falta de scopes).
 */
export async function descartarOperacionesNoBloqueantesLote(
  db: PrismaClient
): Promise<DescartarLoteResult> {
  return db.$transaction(async (tx) => {
    const candidates = await tx.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        operacionPendiente: { not: null },
        OR: [
          { joinUrl: { not: null } },
          { codigoReunion: { not: null } }
        ]
      },
      select: {
        id: true,
        instancia: {
          select: {
            solicitudSalaId: true,
            estado: true
          }
        }
      }
    });

    if (candidates.length === 0) {
      return { totalDescartadas: 0 };
    }

    const ids = candidates.map((c) => c.id);

    await tx.eventoProveedor.updateMany({
      where: { id: { in: ids } },
      data: {
        operacionPendiente: null,
        reclamoIntegracionAt: null,
        reclamoIntegracionToken: null,
        errorIntegracion: null,
        estadoIntegracion: "SINCRONIZADA"
      }
    });

    const solicitudIds = [
      ...new Set(
        candidates
          .filter((c) => c.instancia && c.instancia.estado !== "CANCELADA")
          .map((c) => c.instancia.solicitudSalaId)
      )
    ];

    for (const solicitudId of solicitudIds) {
      await recalcularSolicitud(tx, solicitudId);
    }

    return { totalDescartadas: candidates.length };
  });
}

/**
 * Reclasifica las operaciones pendientes donde ya existe un enlace Meet pero
 * figuraban erróneamente como 'PROVISIONAR', asignándoles 'CONFIGURAR_MEET'.
 */
export async function reclasificarOperacionesPendientes(
  db: PrismaClient
): Promise<ReclasificarLoteResult> {
  const result = await db.eventoProveedor.updateMany({
    where: {
      proveedor: { tipo: "GOOGLE_MEET" },
      operacionPendiente: "PROVISIONAR",
      OR: [
        { joinUrl: { not: null } },
        { codigoReunion: { not: null } }
      ]
    },
    data: {
      operacionPendiente: "CONFIGURAR_MEET"
    }
  });

  return { totalReclasificadas: result.count };
}
