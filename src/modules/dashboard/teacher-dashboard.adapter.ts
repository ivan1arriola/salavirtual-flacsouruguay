import type { PrismaClient } from "@prisma/client";
import {
  cohostsConfirmados,
  extraerCohostEmailsDeInstancia,
  extraerCohostsUnificadosDeInstancia
} from "@/src/modules/conferencias/api";
import { determinarEstadoTemporal, esMismoDiaMontevideo } from "./dashboard.domain";
import type {
  HeroMeetingDTO,
  RecentRecordingDTO,
  UpcomingMeetingSummaryDTO
} from "./types";
import { esProveedorOperativo } from "@/src/modules/conferencias/proveedores";

export interface TeacherDashboardData {
  readonly heroMeeting: HeroMeetingDTO | null;
  readonly upcomingMeetings: readonly UpcomingMeetingSummaryDTO[];
  readonly recentRecordings: readonly RecentRecordingDTO[];
  readonly totalUpcomingCount: number;
}

export async function obtenerDashboardDocente(
  db: PrismaClient,
  usuarioId: string,
  ahora: Date
): Promise<TeacherDashboardData> {
  const teacherCondition = {
    OR: [
      {
        solicitud: {
          docentePrograma: {
            docente: { usuarioId }
          }
        }
      },
      {
        solicitud: {
          docentePrograma: {
            programa: {
              activo: true,
              docentes: {
                some: {
                  activo: true,
                  docente: { usuarioId }
                }
              }
            }
          }
        }
      }
    ]
  };

  const [instances, totalUpcomingCount, recentRecordingRecords] = await Promise.all([
    db.instanciaSala.findMany({
      where: {
        estado: "PROGRAMADA",
        finProgramadoAt: { gte: ahora },
        ...teacherCondition
      },
      orderBy: { inicioProgramadoAt: "asc" },
      take: 6,
      include: {
        solicitud: {
          include: {
            docentePrograma: {
              include: {
                programa: true,
                docente: { include: { usuario: true } }
              }
            }
          }
        },
        eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
        cohosts: {
          include: {
            cuentaGoogle: { include: { user: true } }
          }
        },
        cohostEmails: true,
        asignaciones: {
          where: { estado: { in: ["ASIGNADO", "ACEPTADO"] } },
          include: { asistenteTecnico: { include: { usuario: true } } },
          take: 1
        }
      }
    }),
    db.instanciaSala.count({
      where: {
        estado: "PROGRAMADA",
        finProgramadoAt: { gte: ahora },
        ...teacherCondition
      }
    }),
    db.archivoReunion.findMany({
      where: {
        tipo: "GRABACION",
        eventoProveedor: {
          instancia: {
            estado: { notIn: ["CANCELADA", "NO_REALIZADA"] },
            ...teacherCondition
          }
        }
      },
      orderBy: [{ capturadoAt: "desc" }, { createdAt: "desc" }],
      take: 3,
      include: {
        eventoProveedor: {
          include: {
            instancia: {
              include: {
                solicitud: {
                  include: {
                    docentePrograma: {
                      include: { programa: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    })
  ]);

  const mappedMeetings = instances.map((instance) => {
    const meet = instance.eventosProveedor.find(
      ({ proveedor }) => esProveedorOperativo(proveedor.tipo)
    );
    const cohostEmails = extraerCohostEmailsDeInstancia(instance);
    const cohostsList = extraerCohostsUnificadosDeInstancia(instance).map((c) => ({
      name: c.name ?? "",
      email: c.email
    }));
    const isVerified = Boolean(
      !meet?.errorIntegracion &&
        !meet?.operacionPendiente &&
        cohostsConfirmados(
          meet?.payloadUltimo,
          meet?.codigoReunion,
          meet?.cuentaProveedor?.emailOrganizador,
          cohostEmails
        )
    );
    const assignment = instance.asignaciones[0];
    const assistantUser = assignment?.asistenteTecnico?.usuario;
    const asistente = assistantUser
      ? {
          id: assignment.asistenteTecnico.id,
          nombre: `${assistantUser.nombres} ${assistantUser.apellidos ?? ""}`.trim()
        }
      : null;

    const estadoTemporal = determinarEstadoTemporal(
      instance.inicioProgramadoAt,
      instance.finProgramadoAt,
      ahora
    );

    return {
      instance,
      meet,
      cohostsList,
      isVerified,
      asistente,
      estadoTemporal
    };
  });

  // Hero meeting: The earliest meeting if it is EN_VIVO or starts today (or next if within 24h)
  const firstMeeting = mappedMeetings[0];
  let heroMeeting: HeroMeetingDTO | null = null;

  if (firstMeeting) {
    const startsToday = esMismoDiaMontevideo(firstMeeting.instance.inicioProgramadoAt, ahora);
    const isLive = firstMeeting.estadoTemporal === "EN_VIVO";
    const hoursUntilStart =
      (firstMeeting.instance.inicioProgramadoAt.getTime() - ahora.getTime()) / (3600 * 1000);

    if (isLive || startsToday || hoursUntilStart <= 24) {
      heroMeeting = {
        id: firstMeeting.instance.id,
        solicitudId: firstMeeting.instance.solicitud.id,
        titulo: firstMeeting.instance.solicitud.titulo,
        programa: firstMeeting.instance.solicitud.docentePrograma.programa.nombre,
        modalidad: (firstMeeting.instance.modalidadOverride ?? firstMeeting.instance.solicitud.modalidad),
        inicioProgramadoAt: firstMeeting.instance.inicioProgramadoAt.toISOString(),
        finProgramadoAt: firstMeeting.instance.finProgramadoAt.toISOString(),
        inicioAsistenciaAt: firstMeeting.instance.requiereAsistenciaTecnica ? (firstMeeting.instance.inicioAsistenciaTecnicaAt ?? firstMeeting.instance.inicioProgramadoAt).toISOString() : null,
        finAsistenciaAt: firstMeeting.instance.requiereAsistenciaTecnica ? (firstMeeting.instance.finAsistenciaTecnicaAt ?? firstMeeting.instance.finProgramadoAt).toISOString() : null,
        joinUrl: firstMeeting.meet?.joinUrl ?? null,
        cohostConfirmado: firstMeeting.isVerified,
        cohosts: firstMeeting.cohostsList,
        asistente: firstMeeting.asistente,
        requiereAsistencia: firstMeeting.instance.requiereAsistenciaTecnica,
        salaNombre: firstMeeting.meet?.cuentaProveedor?.nombre ?? null
      };
    }
  }

  // Upcoming list: exclude hero if shown, or list the remaining
  const upcomingMeetingsToMap = heroMeeting ? mappedMeetings.slice(1) : mappedMeetings;
  const upcomingMeetings: UpcomingMeetingSummaryDTO[] = upcomingMeetingsToMap.map(
    ({ instance, meet, isVerified, asistente, estadoTemporal }) => ({
      id: instance.id,
      solicitudId: instance.solicitud.id,
      titulo: instance.solicitud.titulo,
      programa: instance.solicitud.docentePrograma.programa.nombre,
      modalidad: (instance.modalidadOverride ?? instance.solicitud.modalidad),
      inicioProgramadoAt: instance.inicioProgramadoAt.toISOString(),
      finProgramadoAt: instance.finProgramadoAt.toISOString(),
      inicioAsistenciaAt: instance.requiereAsistenciaTecnica ? (instance.inicioAsistenciaTecnicaAt ?? instance.inicioProgramadoAt).toISOString() : null,
      finAsistenciaAt: instance.requiereAsistenciaTecnica ? (instance.finAsistenciaTecnicaAt ?? instance.finProgramadoAt).toISOString() : null,
      joinUrl: meet?.joinUrl ?? null,
      estadoTemporal,
      asistenteNombre: asistente?.nombre ?? null,
      requiereAsistencia: instance.requiereAsistenciaTecnica,
      cohostsVerificados: isVerified
    })
  );

  const recentRecordings: RecentRecordingDTO[] = recentRecordingRecords.map((rec) => {
    const instancia = rec.eventoProveedor.instancia;
    const duracionMin =
      instancia.inicioProgramadoAt && instancia.finProgramadoAt
        ? Math.round(
            (instancia.finProgramadoAt.getTime() - instancia.inicioProgramadoAt.getTime()) /
              60000
          )
        : null;

    return {
      id: rec.id,
      titulo: instancia.solicitud.titulo,
      programa: instancia.solicitud.docentePrograma.programa.nombre,
      fecha: (rec.capturadoAt ?? rec.createdAt).toISOString(),
      duracionMinutos: duracionMin,
      driveUrl: rec.webViewUrl,
      publicUrl: `/reuniones/${instancia.solicitud.id}`
    };
  });

  return {
    heroMeeting,
    upcomingMeetings,
    recentRecordings,
    totalUpcomingCount
  };
}
