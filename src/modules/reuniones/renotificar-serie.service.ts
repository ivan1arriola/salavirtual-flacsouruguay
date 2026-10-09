import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import {
  ConflictApiError,
  ForbiddenApiError,
  NotFoundApiError,
} from "@/src/lib/http/api-error";
import { formatShortDate, formatTime } from "@/src/lib/ui/format";
import { notificarUsuarios, reunionEmailText } from "../notificaciones/notificaciones.service";
import { destinatariosDocentesPrograma, puedeGestionarPrograma } from "./permisos-programa.service";

export type RenotificarSerieDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
}>;

export async function renotificarSerieAlPrograma(
  dependencies: RenotificarSerieDependencies,
  actor: SessionActor,
  solicitudId: string,
  options: Readonly<{ soloVistaPrevia?: boolean }> = {},
): Promise<Readonly<{ destinatarios: number; encuentros: number; asunto?: string; texto?: string }>> {
  const request = await dependencies.db.solicitudSala.findUnique({
    where: { id: solicitudId },
    select: {
      id: true,
      titulo: true,
      modalidad: true,
      requiereAsistenciaTecnica: true,
      requiereGrabacion: true,
      createdAt: true,
      docenteProgramaId: true,
      docentePrograma: {
        select: {
          programaId: true,
          programa: { select: { nombre: true } },
          docente: {
            select: {
              usuario: { select: { nombres: true, apellidos: true } },
            },
          },
        },
      },
    },
  });
  if (!request) throw new NotFoundApiError("La reunión no existe.");
  if (!await puedeGestionarPrograma(dependencies.db, actor, request.docentePrograma.programaId)) {
    throw new ForbiddenApiError("No tiene permisos para notificar esta serie.");
  }

  const recipients = await destinatariosDocentesPrograma(dependencies.db, request.docentePrograma.programaId);
  if (recipients.length === 0) {
    throw new ConflictApiError("El programa no tiene docentes activos para notificar.");
  }

  const seriesRequests = await dependencies.db.solicitudSala.findMany({
    where: {
      docenteProgramaId: request.docenteProgramaId,
      titulo: request.titulo,
      createdAt: request.createdAt,
    },
    select: {
      instancias: {
        where: {
          estado: "PROGRAMADA",
          finProgramadoAt: { gt: new Date() },
        },
        orderBy: { inicioProgramadoAt: "asc" },
        select: {
          inicioProgramadoAt: true,
          finProgramadoAt: true,
          asignaciones: {
            where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
            select: {
              asistenteTecnico: {
                select: {
                  usuario: { select: { nombres: true, apellidos: true } }
                }
              }
            }
          },
          eventosProveedor: {
            where: { proveedor: { tipo: "GOOGLE_MEET" } },
            select: {
              codigoReunion: true,
              joinUrl: true,
              cuentaProveedor: {
                select: {
                  nombre: true,
                  emailOrganizador: true,
                  secretRef: true,
                },
              },
            },
            take: 1,
          },
        },
      },
    },
  });
  const meetings = seriesRequests
    .flatMap(({ instancias }) => instancias)
    .sort((left, right) => left.inicioProgramadoAt.getTime() - right.inicioProgramadoAt.getTime());
  if (meetings.length === 0) {
    throw new ConflictApiError("La serie no tiene encuentros activos o futuros para notificar.");
  }

  const firstAssigned = meetings
    .flatMap((m) => m.asignaciones)
    .find((a) => a.asistenteTecnico)?.asistenteTecnico;
  const assistantName = firstAssigned
    ? [firstAssigned.usuario.nombres, firstAssigned.usuario.apellidos].filter(Boolean).join(" ")
    : null;

  const teacher = request.docentePrograma.docente.usuario;
  const teacherName = [teacher.nombres, teacher.apellidos].filter(Boolean).join(" ");
  const detailsText = reunionEmailText({
    titulo: request.titulo,
    programa: request.docentePrograma.programa.nombre,
    docente: teacherName,
    modalidad: request.modalidad,
    requiereAsistenciaTecnica: request.requiereAsistenciaTecnica,
    requiereGrabacion: request.requiereGrabacion,
    asistenteTecnico: assistantName,
    instancias: meetings.map((meeting) => {
      const meet = meeting.eventosProveedor[0];
      const inicioFecha = formatShortDate(meeting.inicioProgramadoAt);
      const finFecha = formatShortDate(meeting.finProgramadoAt);
      return {
        inicio: `${capitalizar(inicioFecha)}, ${formatTime(meeting.inicioProgramadoAt)}`,
        fin: inicioFecha === finFecha
          ? formatTime(meeting.finProgramadoAt)
          : `${capitalizar(finFecha)}, ${formatTime(meeting.finProgramadoAt)}`,
        sala: meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre,
        meet: meet?.codigoReunion,
        joinUrl: meet?.joinUrl,
      };
    }),
  });

  const asunto = `Serie de reuniones: ${request.titulo}`;
  const texto = `${detailsText}\n\nEste aviso fue reenviado desde Sala Virtual para recordar la serie de reuniones.`;
  if (options.soloVistaPrevia) {
    return { destinatarios: recipients.length, encuentros: meetings.length, asunto, texto };
  }

  await notificarUsuarios(
    dependencies.db,
    recipients,
    {
      tipo: "REUNION_CREADA",
      titulo: "Recordatorio de serie de reuniones",
      cuerpo: `${request.titulo} tiene ${meetings.length} ${meetings.length === 1 ? "encuentro activo" : "encuentros activos o futuros"}.`,
      href: `/reuniones/${request.id}`,
      metadata: { solicitudId: request.id, renotificacion: true },
      emailSubject: asunto,
      emailText: texto,
      emailActionLabel: "Ver reunión",
    },
  );

  await dependencies.db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "REUNION_RENOTIFICADA",
      entidadTipo: "SolicitudSala",
      entidadId: request.id,
      valorNuevo: {
        destinatarios: recipients.length,
        encuentros: meetings.length,
      },
    },
  });

  return { destinatarios: recipients.length, encuentros: meetings.length };
}

function passwordCuenta(
  descifrar: (value: string) => string,
  secretRef: string | null | undefined,
): string | null {
  if (!secretRef) return null;
  try {
    return descifrar(secretRef);
  } catch {
    return null;
  }
}

function capitalizar(value: string): string {
  return value.length > 0 ? value[0].toUpperCase() + value.slice(1) : value;
}
