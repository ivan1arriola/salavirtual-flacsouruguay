import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { registrarIncidenciaOperativa } from "@/src/bootstrap/reunion-operativa.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";

type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { instanciaId } = await context.params;
    const incidencia = await registrarIncidenciaOperativa(
      { id: actor.id, rol: actor.rol },
      instanciaId,
      await request.json().catch(() => null)
    );

    return NextResponse.json({ incidencia }, { status: 201 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
