import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
export const runtime = "nodejs";
import { listarEncuentrosCandidatosZoomAdmin } from "@/src/bootstrap/zoom-historico.server";
export async function GET(_request: Request, context: { params: Promise<{ ocurrenciaId: string }> }) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  if (actor.rol !== "ADMINISTRACION") return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  try {
    const { ocurrenciaId } = await context.params;
    const r = await listarEncuentrosCandidatosZoomAdmin({ id: actor.id, rol: actor.rol }, ocurrenciaId);
    if (r.tipo === "PROHIBIDO") return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    if (r.tipo === "NO_ENCONTRADO") return NextResponse.json({ error: "Ocurrencia no encontrada." }, { status: 404 });
    return NextResponse.json({ candidatos: r.candidatos });
  } catch { return NextResponse.json({ error: "No se pudieron cargar los encuentros." }, { status: 500 }); }
}
