import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { sincronizarArtefactos } from "@/src/bootstrap/archivos.server";
import { toHttpError } from "@/src/lib/http/api-error";
export const runtime = "nodejs";
type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;
export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const { instanciaId } = await context.params;
    const event = await db.eventoProveedor.findFirst({ where: { instanciaSalaId: instanciaId, proveedor: { tipo: "GOOGLE_MEET" } }, select: { id: true } });
    if (!event) return NextResponse.json({ error: "No se encontró un encuentro Meet para esta instancia." }, { status: 404 });
    const [result] = await sincronizarArtefactos([event.id], true);
    if (!result || result.estado === "ERROR") {
      return NextResponse.json({
        error: "No se pudo regenerar la planilla de asistencia.",
        detalle: result?.error ?? "La sincronización no devolvió un motivo del error."
      }, { status: 502 });
    }
    return NextResponse.json({ estado: result.estado }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

