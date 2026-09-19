import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { asignarAsistente, sincronizarAsignacionAsistente } from "@/src/bootstrap/asistencia.server";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor) {
      return NextResponse.json({ error: "La sesión está desactualizada." }, { status: 401 });
    }
    const assignment = await asignarAsistente(actor, await request.json().catch(() => null));
    const sincronizacion = await sincronizarAsignacionAsistente(assignment.instanciaSalaId, "La asignación quedó guardada, pero Google Calendar todavía tiene sincronizaciones pendientes.");

    return NextResponse.json({
      assignment,
      ...sincronizacion,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Datos inválidos." },
      { status: 400 }
    );
  }
}
