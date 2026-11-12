import type { PrismaClient } from "@prisma/client";
import { obtenerDashboardAsistente } from "../asistencia/dashboard-asistente.adapter";
import {
  cohostsConfirmados,
  extraerCohostEmailsDeInstancia,
  extraerCohostsUnificadosDeInstancia
} from "@/src/modules/conferencias/api";
import { seleccionarEventoProveedorActivo } from "../reuniones/evento-proveedor-activo.domain";
import { determinarEstadoTemporal } from "./dashboard.domain";
import type {
  AssistantDashboardData,
  AssistantOpportunityDTO,
  HeroMeetingDTO,
  UpcomingMeetingSummaryDTO
} from "./types";

export async function obtenerDashboardAsistenteOptimizado(
  db: PrismaClient,
  usuarioId: string,
  ahora: Date
): Promise<AssistantDashboardData | null> {
  const assistantRecord = await db.asistenteTecnico.findUnique({
    where: { usuarioId },
    select: { id: true }
  });
  if (!assistantRecord) {
    return null;
  }

  const [baseDashboard, openOpportunityInstances, userAccounts] = await Promise.all([
    obtenerDashboardAsistente(db, usuarioId, ahora),
    db.instanciaSala.findMany({
      where: {
        requiereAsistenciaTecnica: true,
        inicioProgramadoAt: { gte: ahora },
        estado: "PROGRAMADA",
        asignaciones: { none: { estado: { in: ["ASIGNADO", "ACEPTADO"] } } }
      },
      orderBy: { inicioProgramadoAt: "asc" },
      take: 3,
      include: {
        solicitud: {
          include: {
            docentePrograma: {
              include: { programa: true }
            }
          }
        },
        postulaciones: {
          where: { asistenteTecnicoId: assistantRecord.id },
          select: { estado: true }
        }
      }
    }),
    db.cuentaGoogleFlacso.findMany({
      where: { userId: usuarioId },
      select: { email: true }
    })
  ]);

  if (!baseDashboard) {
    return null;
  }

  // Check next meeting details (if available) with cohost verification
  let heroMeeting: HeroMeetingDTO | null = null;
  const userEmails = userAccounts.map((a) => a.email.toLowerCase());

  if (baseDashboard.nextMeeting) {
    const nextMeetingInstance = await db.instanciaSala.findUnique({
      where: { id: baseDashboard.nextMeeting.id },
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
        cohosts: { include: { cuentaGoogle: { include: { user: true } } } },
        cohostEmails: true
      }
    });

    if (nextMeetingInstance) {
      // Cohosts se verifican solo contra Google Meet; enlace y sala siguen al proveedor activo.
      const meetCohosts = nextMeetingInstance.eventosProveedor.find(
        ({ proveedor }) => proveedor.tipo === "GOOGLE_MEET"
      );
      const meet = seleccionarEventoProveedorActivo(nextMeetingInstance);
      const cohostEmails = extraerCohostEmailsDeInstancia(nextMeetingInstance);
      const isVerified = Boolean(
        !meetCohosts?.errorIntegracion &&
        !meetCohosts?.operacionPendiente &&
        cohostsConfirmados(
          meetCohosts?.payloadUltimo,
          meetCohosts?.codigoReunion,
          meetCohosts?.cuentaProveedor?.emailOrganizador,
          cohostEmails
        )
      );

      const assistantIsCohost = cohostEmails.some((e) => userEmails.includes(e.toLowerCase()));

      heroMeeting = {
        id: nextMeetingInstance.id,
        solicitudId: nextMeetingInstance.solicitud.id,
        titulo: nextMeetingInstance.solicitud.titulo,
        programa: nextMeetingInstance.solicitud.docentePrograma.programa.nombre,
        modalidad: nextMeetingInstance.modalidadOverride ?? nextMeetingInstance.solicitud.modalidad,
        inicioProgramadoAt: nextMeetingInstance.inicioProgramadoAt.toISOString(),
        finProgramadoAt: nextMeetingInstance.finProgramadoAt.toISOString(),
        inicioAsistenciaAt: nextMeetingInstance.inicioAsistenciaTecnicaAt?.toISOString() ?? null,
        finAsistenciaAt: nextMeetingInstance.finAsistenciaTecnicaAt?.toISOString() ?? null,
        joinUrl: meet?.joinUrl ?? null,
        providerType: meet?.proveedor.tipo ?? nextMeetingInstance.proveedorActivoTipo ?? null,
        cohostConfirmado: isVerified && assistantIsCohost,
        cohosts: extraerCohostsUnificadosDeInstancia(nextMeetingInstance).map((c) => ({
          name: c.name ?? "",
          email: c.email
        })),
        asistente: null,
        requiereAsistencia: true,
        salaNombre: meet?.cuentaProveedor?.nombre ?? null
      };
    }
  }

  const upcomingCoverages: UpcomingMeetingSummaryDTO[] = baseDashboard.proximasCoberturas
    .slice(1)
    .map((m) => ({
      id: m.id,
      solicitudId: m.solicitudId,
      titulo: m.titulo,
      programa: m.programa,
      modalidad: m.modalidad,
      inicioProgramadoAt: m.inicioEncuentroAt.toISOString(),
      finProgramadoAt: m.finEncuentroAt.toISOString(),
      inicioAsistenciaAt: m.inicioAsistenciaConfiguradaAt?.toISOString() ?? null,
      finAsistenciaAt: m.finAsistenciaConfiguradaAt?.toISOString() ?? null,
      joinUrl: m.joinUrl,
      estadoTemporal: determinarEstadoTemporal(m.inicioEncuentroAt, m.finEncuentroAt, ahora),
      asistenteNombre: null,
      requiereAsistencia: true,
      cohostsVerificados: true
    }));

  const openOpportunities: AssistantOpportunityDTO[] = openOpportunityInstances.map((opp) => ({
    id: opp.id,
    solicitudId: opp.solicitud.id,
    titulo: opp.solicitud.titulo,
    programa: opp.solicitud.docentePrograma.programa.nombre,
    modalidad: opp.modalidadOverride ?? opp.solicitud.modalidad,
    inicioProgramadoAt: opp.inicioProgramadoAt.toISOString(),
    finProgramadoAt: opp.finProgramadoAt.toISOString(),
    yaPostulado: opp.postulaciones.some((p) => p.estado === "ME_INTERESA")
  }));

  const currentMinutes = baseDashboard.mesActual.minutosVirtuales + baseDashboard.mesActual.minutosHibridos;
  const previousMinutes =
    baseDashboard.mesAnterior.minutosVirtuales + baseDashboard.mesAnterior.minutosHibridos;

  return {
    heroMeeting,
    upcomingCoverages,
    openOpportunities,
    stats: {
      currentMonthMinutes: currentMinutes,
      currentMonthVirtualMinutes: baseDashboard.mesActual.minutosVirtuales,
      currentMonthHybridMinutes: baseDashboard.mesActual.minutosHibridos,
      previousMonthMinutes: previousMinutes,
      previousMonthVirtualMinutes: baseDashboard.mesAnterior.minutosVirtuales,
      previousMonthHybridMinutes: baseDashboard.mesAnterior.minutosHibridos,
      postulacionesCount: baseDashboard.postulaciones,
      pendientesRespuesta: baseDashboard.pendientesRespuesta,
      respondidas: baseDashboard.respondidas,
      reunionesDisponibles: baseDashboard.reunionesDisponibles
    }
  };
}
