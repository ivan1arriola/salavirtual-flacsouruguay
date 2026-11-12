import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { obtenerReunionZoomHttp, obtenerZoomAccessToken } from "@/src/integrations/zoom/zoom-client";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { obtenerEnlaceInicioZoom } from "@/src/modules/reuniones/iniciar-reunion-zoom.service";

export const runtime = "nodejs";

type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;

/** Redirige al anfitrión a su enlace de inicio de Zoom, siempre vigente y fuera del HTML. */
export async function GET(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { instanciaId } = await context.params;

    const startUrl = await obtenerEnlaceInicioZoom(
      {
        db,
        obtenerStartUrl: async (zoomMeetingId) => {
          const credenciales = await obtenerCredencialesZoom(db, descifrarConfiguracion);
          if (!credenciales.disponible) {
            throw new Error(credenciales.error);
          }
          const token = await obtenerZoomAccessToken(credenciales);
          return (await obtenerReunionZoomHttp(token, zoomMeetingId)).startUrl ?? null;
        }
      },
      actor,
      instanciaId
    );

    return NextResponse.redirect(startUrl, { status: 302, headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json(
      { error: mapped.message },
      { status: mapped.status, headers: { "Cache-Control": "no-store" } }
    );
  }
}
