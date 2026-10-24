import { Prisma, type PrismaClient } from "@prisma/client";
import {
  estadoIntegracionEfectivo,
  type GoogleCalendarCredentials,
} from "@/src/modules/conferencias/api";
import { obtenerCredencialGoogleParaSala } from "@/src/modules/configuracion/api";
import { resolverEstadoSolicitudPorIntegraciones } from "./encuentros.domain";

export async function cargarCredencialesEncuentro(
  db: PrismaClient,
  descifrar: (value: string) => string,
  subject?: string | null
): Promise<GoogleCalendarCredentials> {
  if (!subject) {
    throw new Error("Google Workspace no está configurado para modificar el encuentro.");
  }
  const salaCred = await obtenerCredencialGoogleParaSala(db, subject, descifrar);
  if (!salaCred) {
    throw new Error("Google Workspace no está configurado para modificar el encuentro.");
  }
  return salaCred;
}

export async function recalcularSolicitud(
  tx: Prisma.TransactionClient,
  solicitudId: string
): Promise<void> {
  const meetings = await tx.instanciaSala.findMany({
    where: { solicitudSalaId: solicitudId, estado: { not: "CANCELADA" } },
    orderBy: { inicioProgramadoAt: "asc" },
    select: {
      inicioProgramadoAt: true,
      finProgramadoAt: true,
      requiereAsistenciaTecnica: true,
      requiereGrabacion: true,
      eventosProveedor: {
        select: {
          estadoIntegracion: true,
          joinUrl: true,
          codigoReunion: true,
          errorIntegracion: true
        }
      }
    }
  });
  if (meetings.length === 0) {
    // Normal flows protect this invariant with the solicitud advisory lock.
    // Silently preserving aggregate values would hide a migration/manual-data
    // corruption and make later decisions use stale dates and flags.
    throw new Error(`La solicitud ${solicitudId} no tiene instancias activas; requiere reparación de datos.`);
  }
  const estadosIntegracion = meetings.flatMap(({ eventosProveedor }) =>
    eventosProveedor.map((event) => estadoIntegracionEfectivo(event))
  );
  const estado = resolverEstadoSolicitudPorIntegraciones(estadosIntegracion);
  await tx.solicitudSala.update({
    where: { id: solicitudId },
    data: {
      estado,
      canceladaAt: null,
      canceladaMotivo: null,
      cantidadInstancias: meetings.length,
      tipoInstancias: meetings.length === 1 ? "UNICA" : "MULTIPLE",
      fechaInicioSolicitada: meetings[0].inicioProgramadoAt,
      fechaFinSolicitada: meetings.reduce(
        (latest, item) => item.finProgramadoAt > latest ? item.finProgramadoAt : latest,
        meetings[0].finProgramadoAt
      ),
      requiereAsistenciaTecnica: meetings.some(({ requiereAsistenciaTecnica }) => requiereAsistenciaTecnica),
      requiereGrabacion: meetings.some(({ requiereGrabacion }) => requiereGrabacion)
    }
  });
}

export async function auditarEncuentro(
  tx: Prisma.TransactionClient,
  actorUsuarioId: string,
  accion: string,
  entidadId: string,
  valorAnterior: Prisma.InputJsonValue | null,
  valorNuevo: Prisma.InputJsonValue | null
): Promise<void> {
  await tx.auditoria.create({
    data: {
      actorUsuarioId,
      accion,
      entidadTipo: "InstanciaSala",
      entidadId,
      valorAnterior: valorAnterior ?? Prisma.JsonNull,
      valorNuevo: valorNuevo ?? Prisma.JsonNull
    }
  });
}
