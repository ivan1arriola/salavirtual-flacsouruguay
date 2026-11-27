import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
export const runtime = "nodejs";
import { reintentarArchivoZoomAdmin } from "@/src/bootstrap/zoom-historico.server";
export async function POST(_request: Request, context: { params: Promise<{ archivoId: string }> }) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    return NextResponse.json({ error: "Sin sesión." }, { status: 401 });
  }
  if (actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
  }
  try {
    const { archivoId } = await context.params;
    const r = await reintentarArchivoZoomAdmin({ id: actor.id, rol: actor.rol }, archivoId);
    if (r.tipo === "PROHIBIDO") {
      return NextResponse.json({ error: "Acceso denegado." }, { status: 403 });
    }
    if (r.tipo === "NO_ENCONTRADO") {
      return NextResponse.json({ error: "Archivo no encontrado." }, { status: 404 });
    }
    if (r.tipo === "ESTADO_NO_REINTENTABLE") {
      return NextResponse.json(
        { error: "El archivo no se puede reintentar en su estado actual." },
        { status: 409 },
      );
    }
    return NextResponse.json({ tipo: "OK" });
  } catch {
    return NextResponse.json({ error: "No se pudo reintentar." }, { status: 500 });
  }
}
