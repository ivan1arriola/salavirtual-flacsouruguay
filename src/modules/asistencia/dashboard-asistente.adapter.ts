import type { PrismaClient } from "@prisma/client";
import {
  claveMesAnteriorUtc3,
  contarPostulacionesAbiertas
} from "./dashboard-asistente.domain";
import { obtenerAsistenciasPersonales } from "./resumen-personal.adapter";
import {
  claveMesUtc3,
  resumirAsistencias
} from "./resumen-personal.domain";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export async function obtenerDashboardAsistente(
  db: PrismaClient,
  usuarioId: string,
  ahora = new Date()
) {
  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId },
    select: { id: true }
  });
  if (!assistant) return null;

  const [upcomingAssignments, upcomingCount, openMeetings, interests, currentMeetings, history] = await Promise.all([
    db.asignacionAsistenciaTecnica.findMany({
      where: {
        asistenteTecnicoId: assistant.id,
        estado: { in: [...ACTIVE_ASSIGNMENTS] },
        instancia: { finProgramadoAt: { gte: ahora }, estado: "PROGRAMADA" }
      },
      orderBy: { instancia: { inicioProgramadoAt: "asc" } },
      take: 8,
      include: {
        instancia: {
          include: {
            solicitud: { include: { docentePrograma: { include: { programa: true } } } },
            eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } }
          }
        }
      }
    }),
    db.asignacionAsistenciaTecnica.count({
      where: {
        asistenteTecnicoId: assistant.id,
        estado: { in: [...ACTIVE_ASSIGNMENTS] },
        instancia: { finProgramadoAt: { gte: ahora }, estado: "PROGRAMADA" }
      }
    }),
    db.instanciaSala.findMany({
      where: {
        requiereAsistenciaTecnica: true,
        finProgramadoAt: { gte: ahora },
        estado: "PROGRAMADA",
        asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } }
      },
      select: { id: true }
    }),
    db.postulacionAsistenciaTecnica.findMany({
      where: { asistenteTecnicoId: assistant.id, instancia: { finProgramadoAt: { gte: ahora } } },
      select: { instanciaSalaId: true, estado: true }
    }),
    obtenerAsistenciasPersonales(db, usuarioId, "MES_ACTUAL", ahora),
    obtenerAsistenciasPersonales(db, usuarioId, "HISTORICO", ahora)
  ]);

  const openIds = new Set(openMeetings.map(({ id }) => id));
  const respondedOpen = new Set(
    interests.filter(({ instanciaSalaId }) => openIds.has(instanciaSalaId)).map(({ instanciaSalaId }) => instanciaSalaId)
  );
  const previousMonth = claveMesAnteriorUtc3(ahora);
  const previousMeetings = history.filter(({ inicioAt }) => claveMesUtc3(inicioAt) === previousMonth);
  const proximasCoberturas = upcomingAssignments.map((assignment) => {
    const meeting = assignment.instancia;
    const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
    return {
      id: meeting.id,
      titulo: meeting.solicitud.titulo,
      programa: meeting.solicitud.docentePrograma.programa.nombre,
      inicioAt: meeting.inicioProgramadoAt,
      finAt: meeting.finProgramadoAt,
      modalidad: meeting.solicitud.modalidad,
      sala: meet?.cuentaProveedor?.nombre ?? "Sin sala asignada",
      joinUrl: meet?.joinUrl ?? null
    };
  });

  return {
    nextMeeting: proximasCoberturas[0] ?? null,
    proximasCoberturas,
    reunionesDisponibles: openMeetings.length,
    postulaciones: contarPostulacionesAbiertas(openIds, interests),
    proximasReuniones: upcomingCount,
    pendientesRespuesta: Math.max(0, openMeetings.length - respondedOpen.size),
    respondidas: respondedOpen.size,
    mesActual: resumirAsistencias(currentMeetings),
    mesAnterior: resumirAsistencias(previousMeetings)
  };
}
