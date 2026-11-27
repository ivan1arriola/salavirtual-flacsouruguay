import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { actualizarExcepcionGoogleMeet } from "@/src/modules/reuniones/migracion-zoom.service";

export const runtime = "nodejs";

type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;

const bodySchema = z.object({
  conservar: z.boolean(),
  motivo: z.string().max(500).nullish(),
});

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { instanciaId } = await context.params;
    const input = bodySchema.parse(await request.json());
    const instancia = await actualizarExcepcionGoogleMeet(
      db,
      { id: actor.id, rol: actor.rol },
      { instanciaId, ...input },
    );
    return NextResponse.json({ instancia });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
