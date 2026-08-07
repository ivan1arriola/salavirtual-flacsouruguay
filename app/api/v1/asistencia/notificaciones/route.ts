import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { renotificarAsistentesDisponibles } from "@/src/modules/asistencia/asistencia.service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor) return NextResponse.json({ error: "La sesión está desactualizada." }, { status: 401 });
    const notified = await renotificarAsistentesDisponibles(
      db,
      actor,
      await request.json().catch(() => null)
    );
    return NextResponse.json({ message: `Se volvió a notificar a ${notified} asistentes.` });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "No se pudo enviar el recordatorio." },
      { status: 400 }
    );
  }
}
