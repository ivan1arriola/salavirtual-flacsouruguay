import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { provisionarEventosMeet } from "@/src/modules/meet/provisionar-eventos.service";
import { crearReuniones } from "@/src/modules/reuniones/crear-reuniones.service";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const input = await request.json().catch(() => null);

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo) {
      return NextResponse.json(
        { error: "La sesión está desactualizada. Volvé a iniciar sesión." },
        { status: 401 }
      );
    }
    const result = await crearReuniones(
      db,
      { id: actor.id, rol: actor.rol },
      input,
    );
    const provisionamiento = await provisionarEventosMeet(
      {
        db,
        descifrar: descifrarConfiguracion,
        crearProvider: crearGoogleCalendarProvider,
      },
      result.eventoProveedorIds,
    );
    const { eventoProveedorIds: _, ...reunion } = result;
    return NextResponse.json({ ...reunion, provisionamiento }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Datos invalidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
