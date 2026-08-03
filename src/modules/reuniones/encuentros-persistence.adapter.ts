import { Prisma, type PrismaClient } from "@prisma/client";
import type { GoogleCalendarCredentials } from "../meet/google-calendar.adapter";

export function cargarEncuentro(
  db: PrismaClient,
  solicitudId: string,
  instanciaId: string
) {
  return db.instanciaSala.findFirst({
    where: { id: instanciaId, solicitudSalaId: solicitudId },
    include: {
      solicitud: { include: { docentePrograma: { include: { docente: true } } } },
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } }
    }
  });
}

export async function cargarCredencialesEncuentro(
  db: PrismaClient,
  descifrar: (value: string) => string,
  subject?: string | null
): Promise<GoogleCalendarCredentials> {
  const config = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true }
  });
  if (!config?.serviceAccountEmail || !config.privateKeyCifrada || !subject) {
    throw new Error("Google Workspace no está configurado para modificar el encuentro.");
  }
  return {
    serviceAccountEmail: config.serviceAccountEmail,
    privateKey: descifrar(config.privateKeyCifrada),
    subject
  };
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
      requiereAsistencia: true,
      requiereGrabacion: true,
      eventosProveedor: {
        select: { estadoIntegracion: true }
      }
    }
  });
  if (meetings.length === 0) return;
  const estadosIntegracion = meetings.flatMap(({ eventosProveedor }) =>
    eventosProveedor.map(({ estadoIntegracion }) => estadoIntegracion)
  );
  const estado = estadosIntegracion.some((item) => item === "ERROR")
    ? "REQUIERE_REVISION"
    : estadosIntegracion.some((item) => item === "PENDIENTE")
      ? "PROVISIONANDO"
      : "PROVISIONADA";
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
      requiereAsistencia: meetings.some(({ requiereAsistencia }) => requiereAsistencia),
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
