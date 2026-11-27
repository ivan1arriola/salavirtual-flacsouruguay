import { toHttpError } from "@/src/lib/http/api-error";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import {
  desvincularAsistente,
  sincronizarAsignacionAsistente,
} from "@/src/bootstrap/asistencia.server";
import { notificarUsuario } from "@/src/modules/notificaciones/notificaciones.service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email,
    });
    if (!actor) {
      return NextResponse.json({ error: "La sesión está desactualizada." }, { status: 401 });
    }

    const assignment = await desvincularAsistente(actor, await request.json().catch(() => null));
    const sincronizacion = await sincronizarAsignacionAsistente(
      assignment.instanciaSalaId,
      "La desvinculación quedó guardada, pero Google Calendar todavía tiene sincronizaciones pendientes.",
    );
    const warnings = [sincronizacion.warning].filter(Boolean);

    // La baja administrativa debe comunicarse a la persona afectada, sin abrir una nueva convocatoria.
    if (actor.rol === "ADMINISTRACION") {
      try {
        const meeting = await db.instanciaSala.findUnique({
          where: { id: assignment.instanciaSalaId },
          select: { solicitud: { select: { titulo: true } } },
        });
        const title = meeting?.solicitud.titulo ?? "una reunión";
        await notificarUsuario(
          db,
          {
            usuarioId: assignment.asistenteUsuarioId,
            email: assignment.asistenteEmail,
          },
          {
            tipo: "ASISTENCIA_ASIGNACION",
            titulo: "Monitoreo desasignado",
            cuerpo: `Ya no estás asignado al monitoreo de ${title}.`,
            href: "/mi-agenda",
            metadata: { instanciaSalaId: assignment.instanciaSalaId, estado: "CANCELADO" },
            emailSubject: `Se canceló tu asignación de monitoreo: ${title}`,
            emailText: `Ya no estás asignado al monitoreo de "${title}". El encuentro sigue requiriendo cobertura, pero no tenés que realizar ese monitoreo. Podés consultar tus próximas asignaciones en Sala Virtual.`,
            emailActionLabel: "Ver mi agenda",
          },
        );
      } catch (error) {
        console.error("No se pudo notificar la desasignación al asistente.", error);
        warnings.push(
          "La desasignación se guardó, pero la notificación a la persona afectada quedó pendiente.",
        );
      }
    }
    const warning = warnings.join(" ") || null;

    return NextResponse.json(
      {
        assignment,
        ...sincronizacion,
        warning,
      },
      { status: warning ? 202 : 200 },
    );
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
