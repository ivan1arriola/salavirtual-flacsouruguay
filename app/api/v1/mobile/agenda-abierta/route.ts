import { toHttpError } from "@/src/lib/http/api-error";
import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { db } from "@/src/lib/db";
import {
  evaluarConflictoAsistencia,
  type AsignacionExistente,
} from "@/src/modules/asistencia/agenda-abierta.domain";
import { actualizarPostulacionAsistencia } from "@/src/modules/asistencia/asistencia.service";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

async function resolveMobileAssistant(request: Request) {
  const actor = await requireMobileActor(request, ["ASISTENTE_TECNICO"]);

  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId: actor.id },
    select: { id: true, cesadoHastaProximoInicioSesion: true },
  });
  if (!assistant || assistant.cesadoHastaProximoInicioSesion) {
    return null;
  }

  return { actor, assistant };
}

export async function GET(request: Request) {
  let resolved: Awaited<ReturnType<typeof resolveMobileAssistant>>;
  try {
    resolved = await resolveMobileAssistant(request);
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (!resolved) {
    return NextResponse.json(
      { error: "La cuenta ya no tiene acceso como asistente técnico." },
      { status: 403 },
    );
  }

  const { assistant } = resolved;
  const now = new Date();

  const meetings = await db.instanciaSala.findMany({
    where: {
      requiereAsistenciaTecnica: true,
      finProgramadoAt: { gte: now },
      estado: "PROGRAMADA",
      asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } },
    },
    orderBy: { inicioProgramadoAt: "asc" },
    include: {
      solicitud: {
        include: {
          docentePrograma: {
            include: {
              programa: true,
              docente: { include: { usuario: true } },
            },
          },
        },
      },
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } },
    },
  });

  const meetingIds = meetings.map(({ id }) => id);
  const [assignments, interests] = await Promise.all([
    db.asignacionAsistenciaTecnica.findMany({
      where: {
        asistenteTecnicoId: assistant.id,
        estado: { in: [...ACTIVE_ASSIGNMENTS] },
        instancia: {
          finProgramadoAt: { gte: now },
          estado: "PROGRAMADA",
        },
      },
      select: {
        instancia: {
          select: {
            id: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            inicioAsistenciaTecnicaAt: true,
            finAsistenciaTecnicaAt: true,
            solicitud: { select: { titulo: true } },
          },
        },
      },
    }),
    meetingIds.length > 0
      ? db.postulacionAsistenciaTecnica.findMany({
          where: {
            instanciaSalaId: { in: meetingIds },
            asistenteTecnicoId: assistant.id,
          },
          select: { instanciaSalaId: true, estado: true },
        })
      : Promise.resolve([]),
  ]);

  const assignedList: AsignacionExistente[] = assignments.map(({ instancia }) => ({
    id: instancia.id,
    titulo: instancia.solicitud.titulo,
    inicio: instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt,
    fin: instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt,
  }));

  const openMeetings = meetings.map((meeting) => {
    const association = meeting.solicitud.docentePrograma;
    const teacher = association.docente.usuario;
    const meet = seleccionarEventoProveedorActivo(meeting);
    const interest = interests.find((item) => item.instanciaSalaId === meeting.id);
    const modality = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
    const inicioAsistenciaConfigurada =
      modality === "VIRTUAL"
        ? new Date(meeting.inicioProgramadoAt.getTime() - 15 * 60_000)
        : meeting.inicioAsistenciaTecnicaAt;
    const finAsistenciaConfigurada =
      modality === "VIRTUAL" ? meeting.finProgramadoAt : meeting.finAsistenciaTecnicaAt;
    const inicioAsistencia = inicioAsistenciaConfigurada ?? meeting.inicioProgramadoAt;
    const finAsistencia = finAsistenciaConfigurada ?? meeting.finProgramadoAt;
    const conflict = evaluarConflictoAsistencia(
      { inicio: inicioAsistencia, fin: finAsistencia },
      assignedList,
    );

    return {
      id: meeting.id,
      requestId: meeting.solicitud.id,
      title: meeting.solicitud.titulo,
      program: association.programa.nombre,
      teacher: [teacher.nombres, teacher.apellidos].filter(Boolean).join(" "),
      modality,
      startsAt: meeting.inicioProgramadoAt.toISOString(),
      endsAt: meeting.finProgramadoAt.toISOString(),
      assistanceStartsAt: inicioAsistenciaConfigurada?.toISOString() ?? null,
      assistanceEndsAt: finAsistenciaConfigurada?.toISOString() ?? null,
      timezone: meeting.timezone,
      googleAccount:
        meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? null,
      interested: interest?.estado === "ME_INTERESA",
      availabilityState: conflict.estado,
      availabilityLabel: conflict.etiqueta,
      availabilityDetail: "detalle" in conflict ? conflict.detalle : null,
      durationMinutes: Math.max(
        1,
        Math.round((finAsistencia.getTime() - inicioAsistencia.getTime()) / 60_000),
      ),
    };
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary: {
      openCount: openMeetings.length,
      interestedCount: openMeetings.filter(({ interested }) => interested).length,
    },
    meetings: openMeetings,
  });
}

export async function PUT(request: Request) {
  let resolved: Awaited<ReturnType<typeof resolveMobileAssistant>>;
  try {
    resolved = await resolveMobileAssistant(request);
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
  if (!resolved) {
    return NextResponse.json(
      { error: "La cuenta ya no tiene acceso como asistente técnico." },
      { status: 403 },
    );
  }

  try {
    const interest = await actualizarPostulacionAsistencia(
      db,
      resolved.actor,
      await request.json().catch(() => null),
    );
    return NextResponse.json({ interest });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
