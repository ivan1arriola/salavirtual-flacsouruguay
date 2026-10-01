import { NextResponse } from "next/server";
import { authConfig } from "@/src/lib/auth/config";
import { mobileActorFromRequest } from "@/src/lib/auth/mobile-token";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { evaluarConflictoAsistencia, type AsignacionExistente } from "@/src/modules/asistencia/agenda-abierta.domain";
import { actualizarPostulacionAsistencia } from "@/src/modules/asistencia/asistencia.service";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

async function resolveMobileAssistant(request: Request) {
  const tokenActor = mobileActorFromRequest(request, authConfig.secret);
  if (!tokenActor) return null;

  const actor = await resolveSessionActor(db, { id: tokenActor.sub });
  if (!actor?.activo || actor.rol !== "ASISTENTE_TECNICO") return null;

  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId: actor.id },
    select: { id: true, cesadoHastaProximoInicioSesion: true }
  });
  if (!assistant || assistant.cesadoHastaProximoInicioSesion) return null;

  return { actor, assistant };
}

export async function GET(request: Request) {
  const resolved = await resolveMobileAssistant(request);
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { assistant } = resolved;
  const now = new Date();

  const meetings = await db.instanciaSala.findMany({
    where: {
      requiereAsistenciaTecnica: true,
      finProgramadoAt: { gte: now },
      estado: "PROGRAMADA",
      asignaciones: { none: { estado: { in: [...ACTIVE_ASSIGNMENTS] } } }
    },
    orderBy: { inicioProgramadoAt: "asc" },
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
      eventosProveedor: { include: { proveedor: true, cuentaProveedor: true } }
    }
  });

  const meetingIds = meetings.map(({ id }) => id);
  const [assignments, interests] = await Promise.all([
    db.asignacionAsistenciaTecnica.findMany({
      where: {
        asistenteTecnicoId: assistant.id,
        estado: { in: [...ACTIVE_ASSIGNMENTS] },
        instancia: {
          finProgramadoAt: { gte: now },
          estado: "PROGRAMADA"
        }
      },
      select: {
        instancia: {
          select: {
            id: true,
            inicioProgramadoAt: true,
            finProgramadoAt: true,
            inicioAsistenciaTecnicaAt: true,
            finAsistenciaTecnicaAt: true,
            solicitud: { select: { titulo: true } }
          }
        }
      }
    }),
    meetingIds.length > 0
      ? db.postulacionAsistenciaTecnica.findMany({
          where: {
            instanciaSalaId: { in: meetingIds },
            asistenteTecnicoId: assistant.id
          },
          select: { instanciaSalaId: true, estado: true }
        })
      : Promise.resolve([])
  ]);

  const assignedList: AsignacionExistente[] = assignments.map(({ instancia }) => ({
    id: instancia.id,
    titulo: instancia.solicitud.titulo,
    inicio: instancia.inicioAsistenciaTecnicaAt ?? instancia.inicioProgramadoAt,
    fin: instancia.finAsistenciaTecnicaAt ?? instancia.finProgramadoAt
  }));

  const openMeetings = meetings.map((meeting) => {
    const association = meeting.solicitud.docentePrograma;
    const teacher = association.docente.usuario;
    const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
    const interest = interests.find((item) => item.instanciaSalaId === meeting.id);
    const inicioAsistencia = meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt;
    const finAsistencia = meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt;
    const conflict = evaluarConflictoAsistencia(
      { inicio: inicioAsistencia, fin: finAsistencia },
      assignedList
    );

    return {
      id: meeting.id,
      requestId: meeting.solicitud.id,
      title: meeting.solicitud.titulo,
      program: association.programa.nombre,
      teacher: [teacher.nombres, teacher.apellidos].filter(Boolean).join(" "),
      modality: meeting.modalidadOverride ?? meeting.solicitud.modalidad,
      startsAt: meeting.inicioProgramadoAt.toISOString(),
      endsAt: meeting.finProgramadoAt.toISOString(),
      assistanceStartsAt: inicioAsistencia.toISOString(),
      assistanceEndsAt: finAsistencia.toISOString(),
      timezone: meeting.timezone,
      googleAccount: meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? null,
      interested: interest?.estado === "ME_INTERESA",
      availabilityState: conflict.estado,
      availabilityLabel: conflict.etiqueta,
      availabilityDetail: "detalle" in conflict ? conflict.detalle : null,
      durationMinutes: Math.max(
        1,
        Math.round((finAsistencia.getTime() - inicioAsistencia.getTime()) / 60_000)
      )
    };
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    summary: {
      openCount: openMeetings.length,
      interestedCount: openMeetings.filter(({ interested }) => interested).length
    },
    meetings: openMeetings
  });
}

export async function PUT(request: Request) {
  const resolved = await resolveMobileAssistant(request);
  if (!resolved) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const interest = await actualizarPostulacionAsistencia(
      db,
      resolved.actor,
      await request.json().catch(() => null)
    );
    return NextResponse.json({ interest });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Datos inválidos." },
      { status: 400 }
    );
  }
}
