import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { asignarAsistentePostulado } from "@/src/modules/asistencia/asistencia.service";

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
    const assignment = await asignarAsistentePostulado(
      db,
      actor,
      await request.json().catch(() => null)
    );
    return NextResponse.json({ assignment }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Datos inválidos." },
      { status: 400 }
    );
  }
}
