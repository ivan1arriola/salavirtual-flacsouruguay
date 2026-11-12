import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { consultarRecuperacionZoom } from "@/src/bootstrap/zoom-historico.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
type RouteContext = Readonly<{ params: Promise<{ barridoId: string }> }>;

/** Progreso de una recuperación histórica. Solo administración. */
export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const { barridoId } = await context.params;
    const progreso = await consultarRecuperacionZoom({ rol: actor.rol }, barridoId);
    if (progreso === null) {
      return NextResponse.json({ error: "No encontrada." }, { status: 404 });
    }
    if (progreso === "PROHIBIDO") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    return NextResponse.json(progreso, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar la recuperación." }, { status: 500 });
  }
}
