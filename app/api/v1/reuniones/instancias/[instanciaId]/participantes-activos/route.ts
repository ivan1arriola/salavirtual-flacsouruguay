import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { crearGoogleMeetArtifactsClient } from "@/src/modules/meet/google-meet-artifacts.adapter";
import { obtenerParticipantesActivosInstancia } from "@/src/modules/meet/live-participants.service";

export const runtime = "nodejs";

type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { instanciaId } = await context.params;
    const result = await obtenerParticipantesActivosInstancia(
      {
        db,
        descifrar: descifrarConfiguracion,
        crearClient: crearGoogleMeetArtifactsClient
      },
      instanciaId
    );

    return NextResponse.json(
      {
        ...result,
        actualizadoAt: new Date().toISOString()
      },
      {
        headers: {
          "Cache-Control": "private, no-store, max-age=0"
        }
      }
    );
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
