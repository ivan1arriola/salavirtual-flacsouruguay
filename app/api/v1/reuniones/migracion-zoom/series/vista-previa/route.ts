import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { obtenerVistaPreviaMigracionZoomPorSerie } from "@/src/modules/reuniones/migracion-zoom-serie.service";
import { reunionCompartidaHabilitada } from "@/src/modules/reuniones/reunion-compartida.domain";

export const runtime = "nodejs";

/** Vista previa por serie, de solo lectura. Solo con la bandera encendida. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (!reunionCompartidaHabilitada(process.env)) {
    return NextResponse.json({ error: "La migración por serie no está habilitada." }, { status: 409 });
  }

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const vistaPrevia = await obtenerVistaPreviaMigracionZoomPorSerie(db, { id: actor.id, rol: actor.rol });
    return NextResponse.json({ vistaPrevia }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
