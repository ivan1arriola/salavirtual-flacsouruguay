import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { cancelarSolicitudesAtomicas } from "@/src/modules/reuniones/cancelar-solicitudes-atomicas.service";

export const runtime = "nodejs";

const schema = z.object({
  solicitudIds: z.array(z.string().min(1).max(128)).min(1).max(50)
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id, email: session.user.email
    });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const input = schema.parse(await request.json().catch(() => null));
    const result = await cancelarSolicitudesAtomicas(db, actor, input.solicitudIds);

    // A successful transaction persists each event's pending CANCELAR operation.
    // The background reconciliation endpoint performs Google HTTP calls later.
    return NextResponse.json({
      message: "La cancelación quedó registrada. Google Calendar se actualizará en segundo plano.",
      solicitudesCanceladas: result.solicitudesCanceladas,
      eventosGooglePendientes: result.eventoProveedorIds.length
    }, { status: 202 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
