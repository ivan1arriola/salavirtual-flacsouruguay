import { NextResponse } from "next/server";
import { authConfig } from "@/src/lib/auth/config";
import { mobileActorFromRequest } from "@/src/lib/auth/mobile-token";
import { db } from "@/src/lib/db";

const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

export async function GET(request: Request) {
  const actor = mobileActorFromRequest(request, authConfig.secret);
  if (!actor) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const assistant = await db.asistenteTecnico.findUnique({
    where: { usuarioId: actor.sub },
    select: {
      id: true,
      usuario: {
        select: {
          activo: true,
          rol: true,
          nombres: true,
          apellidos: true
        }
      }
    }
  });

  if (!assistant || !assistant.usuario.activo || assistant.usuario.rol !== "ASISTENTE_TECNICO") {
    return NextResponse.json({ error: "La cuenta ya no tiene acceso como asistente técnico." }, { status: 403 });
  }

  const now = new Date();
  const meetings = await db.instanciaSala.findMany({
    where: {
      estado: "PROGRAMADA",
      OR: [
        { finAsistenciaTecnicaAt: { gte: now } },
        { finAsistenciaTecnicaAt: null, finProgramadoAt: { gte: now } }
      ],
      asignaciones: {
        some: {
          asistenteTecnicoId: assistant.id,
          estado: { in: [...ACTIVE_ASSIGNMENTS] }
        }
      }
    },
    orderBy: [{ inicioProgramadoAt: "asc" }, { id: "asc" }],
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
      asignaciones: {
        where: {
          asistenteTecnicoId: assistant.id,
          estado: { in: [...ACTIVE_ASSIGNMENTS] }
        },
        orderBy: { updatedAt: "desc" },
        take: 1
      },
      eventosProveedor: {
        include: { proveedor: true, cuentaProveedor: true }
      }
    }
  });

  return NextResponse.json({
    generatedAt: now.toISOString(),
    assistant: {
      id: assistant.id,
      name: [assistant.usuario.nombres, assistant.usuario.apellidos].filter(Boolean).join(" ")
    },
    meetings: meetings.map((meeting) => {
      const association = meeting.solicitud.docentePrograma;
      const meet = meeting.eventosProveedor.find(({ proveedor }) => proveedor.tipo === "GOOGLE_MEET");
      const assignment = meeting.asignaciones[0];

      return {
        id: meeting.id,
        requestId: meeting.solicitud.id,
        title: meeting.solicitud.titulo,
        program: association.programa.nombre,
        teacher: [association.docente.usuario.nombres, association.docente.usuario.apellidos]
          .filter(Boolean)
          .join(" "),
        modality: meeting.modalidadOverride ?? meeting.solicitud.modalidad,
        startsAt: meeting.inicioProgramadoAt.toISOString(),
        endsAt: meeting.finProgramadoAt.toISOString(),
        assistanceStartsAt: (meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt).toISOString(),
        assistanceEndsAt: (meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt).toISOString(),
        timezone: meeting.timezone,
        googleAccount: meet?.cuentaProveedor?.emailOrganizador ?? meet?.cuentaProveedor?.nombre ?? null,
        meetUrl: meet?.joinUrl ?? null,
        assignmentState: assignment?.estado ?? "ASIGNADO",
        description: meeting.descripcion ?? meeting.solicitud.descripcion ?? null
      };
    })
  });
}
