import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { desvincularOcurrenciaZoomAdmin } from "@/src/bootstrap/zoom-historico.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
type RouteContext = Readonly<{ params: Promise<{ ocurrenciaId: string }> }>;

/** Desvincula una ocurrencia de su encuentro (con auditoría). Solo administración. */
export async function POST(request: Request, context: RouteContext) {
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

  const cuerpo = (await request.json().catch(() => null)) as { eventoId?: unknown } | null;
  const eventoId = cuerpo?.eventoId;
  if (typeof eventoId !== "string" || eventoId.length === 0 || eventoId.length > 64) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    const { ocurrenciaId } = await context.params;
    const r = await desvincularOcurrenciaZoomAdmin({ id: actor.id, rol: actor.rol }, ocurrenciaId, eventoId);
    switch (r.tipo) {
      case "DESVINCULADA":
        return NextResponse.json({ referenciasEliminadas: r.referenciasEliminadas }, { status: 200 });
      case "NO_VINCULADA":
        return NextResponse.json({ error: "La ocurrencia no está vinculada a ese encuentro." }, { status: 409 });
      case "NO_ENCONTRADA":
        return NextResponse.json({ error: "No encontrada." }, { status: 404 });
      case "PROHIBIDO":
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "No se pudo desvincular." }, { status: 500 });
  }
}
