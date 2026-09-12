import type { PrismaClient } from "@prisma/client";
import { cohostsConfirmados } from "../meet/cohost-verification.domain";
import { listarCasosRevisionDuplicados } from "../reuniones/duplicados.service";
import { determinarEstadoTemporal } from "./dashboard.domain";
import type { EstadoTemporalReunion } from "./types";

export interface AdminTodayMeetingDTO {
  readonly id: string;
  readonly solicitudId: string;
  readonly titulo: string;
  readonly programa: string;
  readonly docenteNombre: string;
  readonly modalidad: "HIBRIDA" | "VIRTUAL";
  readonly inicioProgramadoAt: string;
  readonly finProgramadoAt: string;
  readonly joinUrl: string | null;
  readonly estadoIntegracion: string | null;
  readonly estadoTemporal: EstadoTemporalReunion;
  readonly cohostConfirmado: boolean;
  readonly cohosts: readonly { readonly name: string; readonly email: string }[];
  readonly cohostCount: number;
  readonly asistente: { readonly id: string; readonly nombre: string } | null;
  readonly requiereAsistencia: boolean;
  readonly organizador: string;
}

export interface AdminDashboardData {
  readonly metrics: {
    readonly openRequests: number;
    readonly todayMeetings: number;
    readonly weekMeetings: number;
    readonly pendingAssistance: number;
    readonly integrationErrors: number;
    readonly pendingRecordings: number;
    readonly openIncidents: number;
    readonly duplicateRisks: number;
  };
  readonly attentionData: {
    readonly pendingCoverage: {
      readonly count: number;
      readonly firstMeetingId: string | null;
      readonly examples: readonly { readonly id: string; readonly title: string; readonly time: string }[];
      readonly firstApplicant: { readonly id: string; readonly name: string } | null;
      readonly assistants: readonly { readonly id: string; readonly name: string }[];
    };
    readonly integrationErrors: {
      readonly count: number;
      readonly examples: readonly { readonly id: string; readonly title: string; readonly error: string }[];
    };
    readonly pendingRecordings: {
      readonly count: number;
      readonly examples: readonly { readonly id: string; readonly title: string; readonly date: string }[];
    };
    readonly openIncidents: {
      readonly count: number;
      readonly examples: readonly { readonly id: string; readonly title: string; readonly description: string }[];
      readonly firstIncidentSolicitudId: string | null;
    };
    readonly duplicateRisks: {
      readonly count: number;
      readonly examples: readonly { readonly leftTitle: string; readonly rightTitle: string }[];
    };
  };
  readonly todayTimeline: readonly AdminTodayMeetingDTO[];
}

export async function obtenerDashboardAdministracion(
  db: PrismaClient,
  ahora: Date
): Promise<AdminDashboardData> {
  const todayStart = startOfMontevideoDay(ahora);
  const todayEnd = new Date(todayStart.getTime() + 24 * 60 * 60 * 1000);
  const weekEnd = new Date(ahora.getTime() + 7 * 24 * 60 * 60 * 1000);
  const recordingLookback = new Date(ahora.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [
    openRequests,
    todayMeetingsCount,
    weekMeetingsCount,
    pendingAssistanceCount,
    integrationErrorsCount,
    pendingRecordingCount,
    openIncidentCount,
    todayInstances,
    pendingCoverageInstances,
    integrationErrorEvents,
    pendingRecordingEvents,
    openIncidentRecords,
    duplicateCases,
    activeAssistants
  ] = await Promise.all([
    db.solicitudSala.count({
      where: { estado: { in: ["REGISTRADA", "PROVISIONANDO", "REQUIERE_REVISION"] } }
    }),
    db.instanciaSala.count({
      where: {
        inicioProgramadoAt: { gte: todayStart, lt: todayEnd },
        estado: "PROGRAMADA"
      }
    }),
    db.instanciaSala.count({
      where: {
        inicioProgramadoAt: { gte: ahora, lt: weekEnd },
        estado: "PROGRAMADA"
      }
    }),
    db.instanciaSala.count({
      where: {
        requiereAsistenciaTecnica: true,
        inicioProgramadoAt: { gte: ahora },
        estado: "PROGRAMADA",
        asignaciones: { none: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } }
      }
    }),
    db.eventoProveedor.count({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        estadoIntegracion: "ERROR",
        instancia: { inicioProgramadoAt: { gte: ahora }, estado: "PROGRAMADA" }
      }
    }),
    db.eventoProveedor.count({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        estadoIntegracion: "SINCRONIZADA",
        archivosSincronizadosAt: null,
        instancia: {
          requiereGrabacion: true,
          finProgramadoAt: { gte: recordingLookback, lt: ahora },
          estado: { notIn: ["CANCELADA", "NO_REALIZADA"] }
        }
      }
    }),
    db.incidencia.count({ where: { estado: { in: ["ABIERTA", "EN_ANALISIS"] } } }),
    // Instances for today's timeline (or ongoing right now)
    db.instanciaSala.findMany({
      where: {
        OR: [
          { inicioProgramadoAt: { gte: todayStart, lt: todayEnd } },
          { finProgramadoAt: { gte: ahora }, inicioProgramadoAt: { lte: ahora } }
        ],
        estado: "PROGRAMADA"
      },
      orderBy: { inicioProgramadoAt: "asc" },
      take: 8,
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
    // Samples for attention cards
    db.instanciaSala.findMany({
      where: {
        requiereAsistenciaTecnica: true,
        inicioProgramadoAt: { gte: ahora },
        estado: "PROGRAMADA",
        asignaciones: { none: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } }
      },
      orderBy: { inicioProgramadoAt: "asc" },
      take: 3,
      select: {
        id: true,
        inicioProgramadoAt: true,
        solicitud: { select: { id: true, titulo: true } },
        postulaciones: {
          where: {
            estado: "ME_INTERESA",
            asistenteTecnico: { cesadoHastaProximoInicioSesion: false }
          },
          include: {
            asistenteTecnico: {
              select: {
                id: true,
                usuario: { select: { nombres: true, apellidos: true } }
              }
            }
          },
          take: 1
        }
      }
    }),
    db.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        estadoIntegracion: "ERROR",
        instancia: { inicioProgramadoAt: { gte: ahora }, estado: "PROGRAMADA" }
      },
      orderBy: { instancia: { inicioProgramadoAt: "asc" } },
      take: 3,
      select: {
        id: true,
        errorIntegracion: true,
        instancia: {
          select: {
            id: true,
            solicitud: { select: { id: true, titulo: true } }
          }
        }
      }
    }),
    db.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        estadoIntegracion: "SINCRONIZADA",
        archivosSincronizadosAt: null,
        instancia: {
          requiereGrabacion: true,
          finProgramadoAt: { gte: recordingLookback, lt: ahora },
          estado: { notIn: ["CANCELADA", "NO_REALIZADA"] }
        }
      },
      orderBy: { instancia: { inicioProgramadoAt: "desc" } },
      take: 3,
      select: {
        id: true,
        instancia: {
          select: {
            id: true,
            inicioProgramadoAt: true,
            solicitud: { select: { id: true, titulo: true } }
          }
        }
      }
    }),
    db.incidencia.findMany({
      where: { estado: { in: ["ABIERTA", "EN_ANALISIS"] } },
      orderBy: [{ severidad: "desc" }, { createdAt: "asc" }],
      take: 3,
      select: {
        id: true,
        descripcion: true,
        instancia: {
          select: {
            solicitud: { select: { id: true, titulo: true } }
          }
        }
      }
    }),
    listarCasosRevisionDuplicados(db, ahora),
    db.asistenteTecnico.findMany({
      where: {
        cesadoHastaProximoInicioSesion: false,
        usuario: { activo: true, rol: "ASISTENTE_TECNICO" }
      },
      orderBy: [{ usuario: { nombres: "asc" } }, { usuario: { apellidos: "asc" } }],
      select: {
        id: true,
        usuario: { select: { nombres: true, apellidos: true } }
      }
    })
  ]);

  const duplicateRisks = duplicateCases.filter(({ decision }) => decision !== "FALSO_POSITIVO");

  const formattedAssistants = activeAssistants.map((ast) => ({
    id: ast.id,
    name: [ast.usuario.nombres, ast.usuario.apellidos].filter(Boolean).join(" ")
  }));

  const firstUncoveredMeeting = pendingCoverageInstances[0];
  const firstApplicantAst = firstUncoveredMeeting?.postulaciones[0]?.asistenteTecnico;
  const firstApplicant = firstApplicantAst
    ? {
        id: firstApplicantAst.id,
        name: [firstApplicantAst.usuario.nombres, firstApplicantAst.usuario.apellidos]
          .filter(Boolean)
          .join(" ")
      }
    : null;

  const todayTimeline: AdminTodayMeetingDTO[] = todayInstances.map((meeting) => {
    const association = meeting.solicitud.docentePrograma;
    const teacher = association.docente.usuario;
    const assignment = meeting.asignaciones[0];
    const assistant = assignment?.asistenteTecnico.usuario;
    const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");

    const cohosts = [
      ...meeting.cohosts.map(({ cuentaGoogle }) => ({
        email: cuentaGoogle.email,
        name: [cuentaGoogle.user.nombres, cuentaGoogle.user.apellidos].filter(Boolean).join(" ")
      })),
      ...meeting.cohostEmails.map(({ email }) => ({ email, name: "" }))
    ].filter(
      (entry, index, entries) =>
        entries.findIndex((candidate) => candidate.email.toLowerCase() === entry.email.toLowerCase()) === index
    );

    const cohostEmails = [
      ...meeting.cohosts.map(({ cuentaGoogle }) => cuentaGoogle.email),
      ...meeting.cohostEmails.map(({ email }) => email)
    ];

    const cohostsConfirmadosEnMeet = Boolean(
      !meet?.errorIntegracion &&
        !meet?.operacionPendiente &&
        cohostsConfirmados(
          meet?.payloadUltimo,
          meet?.codigoReunion,
          meet?.cuentaProveedor?.emailOrganizador,
          cohostEmails
        )
    );

    const organizer =
      meet?.cuentaProveedor?.emailOrganizador ??
      meet?.cuentaProveedor?.nombre ??
      "Pendiente";

    const estadoTemporal = determinarEstadoTemporal(
      meeting.inicioProgramadoAt,
      meeting.finProgramadoAt,
      ahora
    );

    return {
      id: meeting.id,
      solicitudId: meeting.solicitud.id,
      titulo: meeting.solicitud.titulo,
      programa: association.programa.nombre,
      docenteNombre: `${teacher.nombres} ${teacher.apellidos ?? ""}`.trim(),
      modalidad: meeting.solicitud.modalidad,
      inicioProgramadoAt: meeting.inicioProgramadoAt.toISOString(),
      finProgramadoAt: meeting.finProgramadoAt.toISOString(),
      joinUrl: meet?.joinUrl ?? null,
      estadoIntegracion: meet?.estadoIntegracion ?? null,
      estadoTemporal,
      cohostConfirmado: cohostsConfirmadosEnMeet,
      cohosts,
      cohostCount: cohosts.length,
      asistente: assistant
        ? {
            id: assignment.asistenteTecnico.id,
            nombre: `${assistant.nombres} ${assistant.apellidos ?? ""}`.trim()
          }
        : null,
      requiereAsistencia: meeting.requiereAsistenciaTecnica,
      organizador: organizer
    };
  });

  return {
    metrics: {
      openRequests,
      todayMeetings: todayMeetingsCount,
      weekMeetings: weekMeetingsCount,
      pendingAssistance: pendingAssistanceCount,
      integrationErrors: integrationErrorsCount,
      pendingRecordings: pendingRecordingCount,
      openIncidents: openIncidentCount,
      duplicateRisks: duplicateRisks.length
    },
    attentionData: {
      pendingCoverage: {
        count: pendingAssistanceCount,
        firstMeetingId: firstUncoveredMeeting?.id ?? null,
        examples: pendingCoverageInstances.map(({ id, solicitud, inicioProgramadoAt }) => ({
          id,
          title: solicitud.titulo,
          time: inicioProgramadoAt.toISOString()
        })),
        firstApplicant,
        assistants: formattedAssistants
      },
      integrationErrors: {
        count: integrationErrorsCount,
        examples: integrationErrorEvents.map((evt) => ({
          id: evt.id,
          title: evt.instancia.solicitud.titulo,
          error: evt.errorIntegracion ?? "Error desconocido"
        }))
      },
      pendingRecordings: {
        count: pendingRecordingCount,
        examples: pendingRecordingEvents.map((rec) => ({
          id: rec.id,
          title: rec.instancia.solicitud.titulo,
          date: rec.instancia.inicioProgramadoAt.toISOString()
        }))
      },
      openIncidents: {
        count: openIncidentCount,
        examples: openIncidentRecords.map((inc) => ({
          id: inc.id,
          title: inc.instancia.solicitud.titulo,
          description: inc.descripcion
        })),
        firstIncidentSolicitudId: openIncidentRecords[0]?.instancia.solicitud.id ?? null
      },
      duplicateRisks: {
        count: duplicateRisks.length,
        examples: duplicateRisks.slice(0, 3).map(({ izquierda, derecha }) => ({
          leftTitle: izquierda.titulo,
          rightTitle: derecha.titulo
        }))
      }
    },
    todayTimeline
  };
}

function startOfMontevideoDay(date: Date): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);
  const year = parts.find(({ type }) => type === "year")?.value;
  const month = parts.find(({ type }) => type === "month")?.value;
  const day = parts.find(({ type }) => type === "day")?.value;
  return new Date(`${year}-${month}-${day}T00:00:00-03:00`);
}
