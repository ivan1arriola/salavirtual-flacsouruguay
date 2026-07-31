import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { configurarGoogleMeetExistente, crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { provisionarEventosMeet } from "@/src/modules/meet/provisionar-eventos.service";
import { agregarEncuentro } from "@/src/modules/reuniones/gestionar-encuentros.service";

export async function POST(
  request: Request,
  context: Readonly<{ params: Promise<{ solicitudId: string }> }>
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { solicitudId } = await context.params;
    const result = await agregarEncuentro({
      db,
      descifrar: descifrarConfiguracion,
      crearProvider: crearGoogleCalendarProvider,
      configurarEspacio: configurarGoogleMeetExistente
    }, actor, solicitudId, await request.json().catch(() => null));
    const provisionamiento = await provisionarEventosMeet({
      db,
      descifrar: descifrarConfiguracion,
      crearProvider: crearGoogleCalendarProvider
    }, [result.eventoProveedorId]);
    return NextResponse.json({ ...result, provisionamiento }, { status: 201 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo agregar el encuentro."
    }, { status: 400 });
  }
}
