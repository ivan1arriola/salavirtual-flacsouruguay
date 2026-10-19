import { toHttpError } from "@/src/lib/http/api-error";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { renotificarAsistentesDisponibles } from "@/src/modules/asistencia/asistencia.service";
import {
  notificarReunionesAsignadas,
  renotificarReunionesSinAsignar,
} from "@/src/modules/asistencia/notificaciones-masivas.service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor) return NextResponse.json({ error: "La sesión está desactualizada." }, { status: 401 });

    const body = await request.json().catch(() => ({}));

    if (body?.tipo === "SIN_ASIGNAR") {
      const result = await renotificarReunionesSinAsignar(db, actor);
      return NextResponse.json(result);
    }

    if (body?.tipo === "ASIGNADAS") {
      const result = await notificarReunionesAsignadas(db, actor);
      return NextResponse.json(result);
    }

    const notified = await renotificarAsistentesDisponibles(db, actor, body);
    return NextResponse.json({ message: `Se volvió a notificar a ${notified} asistentes de monitoreo.` });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
