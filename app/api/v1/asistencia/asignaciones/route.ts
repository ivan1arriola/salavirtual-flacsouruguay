import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  asignarAsistentePostulado,
  sincronizarCohostsDeInstancia
} from "@/src/modules/asistencia/asistencia.service";
import { configurarGoogleMeetExistente } from "@/src/modules/meet/google-calendar.adapter";

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
    let warning: string | null = null;
    try {
      await sincronizarCohostsDeInstancia({
        db,
        descifrar: descifrarConfiguracion,
        configurarEspacio: configurarGoogleMeetExistente
      }, assignment.instanciaSalaId);
    } catch (error) {
      warning = error instanceof Error ? error.message : "No se pudo sincronizar cohosts en Google Meet.";
    }
    return NextResponse.json({ assignment, warning }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Datos inválidos." },
      { status: 400 }
    );
  }
}
