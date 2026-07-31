import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { configurarGoogleMeetExistente, crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { actualizarEncuentro, eliminarEncuentro } from "@/src/modules/reuniones/gestionar-encuentros.service";

type RouteContext = Readonly<{
  params: Promise<{ solicitudId: string; instanciaId: string }>;
}>;

export async function PATCH(request: Request, context: RouteContext) {
  return execute(request, context, "PATCH");
}

export async function DELETE(request: Request, context: RouteContext) {
  return execute(request, context, "DELETE");
}

async function execute(request: Request, context: RouteContext, method: "PATCH" | "DELETE") {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { solicitudId, instanciaId } = await context.params;
    const dependencies = {
      db,
      descifrar: descifrarConfiguracion,
      crearProvider: crearGoogleCalendarProvider,
      configurarEspacio: configurarGoogleMeetExistente
    };
    if (method === "DELETE") {
      await eliminarEncuentro(dependencies, actor, solicitudId, instanciaId);
    } else {
      await actualizarEncuentro(
        dependencies,
        actor,
        solicitudId,
        instanciaId,
        await request.json().catch(() => null)
      );
    }
    return NextResponse.json({ message: method === "DELETE" ? "Encuentro eliminado." : "Encuentro actualizado." });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo gestionar el encuentro."
    }, { status: 400 });
  }
}
