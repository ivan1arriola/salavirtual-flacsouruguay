import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { obtenerVistaPreviaMigracionZoom } from "@/src/modules/reuniones/migracion-zoom.service";

export const runtime = "nodejs";

/** Vista previa de solo lectura: no escribe en la base ni en proveedores. */
export async function GET() {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const vistaPrevia = await obtenerVistaPreviaMigracionZoom(db, { id: actor.id, rol: actor.rol });
    return NextResponse.json({ vistaPrevia }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
