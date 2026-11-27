import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { reportarDuracionAsistencia } from "@/src/bootstrap/asistencia.server";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email,
    });
    if (!actor?.activo) {
      return NextResponse.json({ error: "La sesión está desactualizada." }, { status: 401 });
    }
    if (actor.rol !== "ASISTENTE_TECNICO") {
      return NextResponse.json(
        { error: "Solo un asistente de monitoreo puede cerrar un monitoreo." },
        { status: 403 },
      );
    }
    const reporte = await reportarDuracionAsistencia(actor, await request.json().catch(() => null));
    return NextResponse.json({ reporte });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
