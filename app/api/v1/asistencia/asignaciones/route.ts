import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  asignarAsistentePostulado,
  sincronizarCohostsDeInstancia
} from "@/src/modules/asistencia/asistencia.service";
import {
  hayErroresSincronizacionCalendarioAsistente,
  sincronizarCalendarioAsistenteInstancia,
} from "@/src/modules/asistencia/calendario-asistente.service";
import {
  eliminarEventoCalendarioAsistente,
  publicarEventoCalendarioAsistente,
} from "@/src/modules/asistencia/calendario-asistente-google.adapter";
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
    const warnings: string[] = [];
    try {
      await sincronizarCohostsDeInstancia({
        db,
        descifrar: descifrarConfiguracion,
        configurarEspacio: configurarGoogleMeetExistente
      }, assignment.instanciaSalaId);
    } catch (error) {
      warnings.push(error instanceof Error ? error.message : "No se pudo sincronizar cohosts en Google Meet.");
    }

    const calendarioAsistente = await sincronizarCalendarioAsistenteInstancia({
      db,
      descifrar: descifrarConfiguracion,
      publicarEvento: publicarEventoCalendarioAsistente,
      eliminarEvento: eliminarEventoCalendarioAsistente,
    }, assignment.instanciaSalaId);
    if (hayErroresSincronizacionCalendarioAsistente(calendarioAsistente)) {
      warnings.push("La asignación quedó guardada, pero Google Calendar todavía tiene sincronizaciones pendientes.");
    }

    return NextResponse.json({
      assignment,
      warning: warnings.length > 0 ? warnings.join(" ") : null,
      calendarioAsistente,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Datos inválidos." },
      { status: 400 }
    );
  }
}
