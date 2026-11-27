import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { db } from "@/src/lib/db";
import { seleccionarEventoProveedorActivo } from "@/src/modules/reuniones/evento-proveedor-activo.domain";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export async function GET(request: Request) {
  let actor: Awaited<ReturnType<typeof requireMobileActor>>;
  try {
    actor = await requireMobileActor(request, ["ASISTENTE_TECNICO"]);
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }

  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId: actor.id },
    select: {
      id: true,
      usuario: {
        select: {
          activo: true,
          rol: true,
          nombres: true,
          apellidos: true,
        },
      },
    },
  });

  if (!assistant || !assistant.usuario.activo || assistant.usuario.rol !== "ASISTENTE_TECNICO") {
    return NextResponse.json(
      { error: "La cuenta ya no tiene acceso como asistente técnico." },
      { status: 403 },
    );
  }

  const now = new Date();
  const meetings = await db.instanciaSala.findMany({
    where: {
      // Mantener visibles las coberturas en curso (incluido el cierre técnico posterior a la clase).
      estado: { in: ["PROGRAMADA", "EN_CURSO"] },
      OR: [
        { finAsistenciaTecnicaAt: { gte: now } },
        { finAsistenciaTecnicaAt: null, finProgramadoAt: { gte: now } },
      ],
      asignaciones: {
        some: {
          asistenteTecnicoId: assistant.id,
          estado: { in: [...ACTIVE_ASSIGNMENTS] },
        },
      },
    },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
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
      asignaciones: {
        where: {
          asistenteTecnicoId: assistant.id,
          estado: { in: [...ACTIVE_ASSIGNMENTS] },
        },
        orderBy: { updatedAt: "desc" },
        take: 1,
      },
      eventosProveedor: {
        include: { proveedor: true, cuentaProveedor: true },
      },
    },
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    assistant: {
      id: assistant.id,
      name: [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" "),
    },
    meetings: meetings.map((meeting) => {
      const association = meeting.solicitud.docentePrograma;
      const meet = seleccionarEventoProveedorActivo(meeting);
      const assignment = meeting.asignaciones[0];
      const modality = meeting.modalidadOverride ?? meeting.solicitud.modalidad;
      const assistanceStartsAt =
        modality === "VIRTUAL"
          ? new Date(meeting.inicioProgramadoAt.getTime() - 15 * 60_000)
          : meeting.inicioAsistenciaTecnicaAt;
      const assistanceEndsAt =
        modality === "VIRTUAL" ? meeting.finProgramadoAt : meeting.finAsistenciaTecnicaAt;

      return {
        id: meeting.id,
        requestId: meeting.solicitud.id,
        title: meeting.solicitud.titulo,
        program: association.programa.nombre,
        teacher: [association.docente.usuario.nombres, association.docente.usuario.apellidos]
          .filter(Boolean)
          .join(" "),
        modality,
        startsAt: meeting.inicioProgramadoAt.toISOString(),
        endsAt: meeting.finProgramadoAt.toISOString(),
        assistanceStartsAt: assistanceStartsAt?.toISOString() ?? null,
        assistanceEndsAt: assistanceEndsAt?.toISOString() ?? null,
        timezone: meeting.timezone,
        googleAccount:
          meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? null,
        meetUrl: meet?.joinUrl ?? null,
        assignmentState: assignment?.estado ?? "ASIGNADO",
        description: meeting.descripcion ?? meeting.solicitud.descripcion ?? null,
      };
    }),
  });
}
