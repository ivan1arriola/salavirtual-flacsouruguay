import { toHttpError } from "@/src/lib/http/api-error";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { desvincularAsistente, sincronizarAsignacionAsistente } from "@/src/bootstrap/asistencia.server";

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
    const sincronizacion = await sincronizarAsignacionAsistente(assignment.instanciaSalaId, "La desvinculación quedó guardada, pero Google Calendar todavía tiene sincronizaciones pendientes.");

    return NextResponse.json({
      assignment,
      ...sincronizacion,
    }, { status: sincronizacion.warning ? 202 : 200 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
