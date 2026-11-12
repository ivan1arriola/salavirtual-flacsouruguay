import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { repararPlanillasAsistenciaVacias } from "@/src/bootstrap/archivos.server";
import { toHttpError } from "@/src/lib/http/api-error";

export const runtime = "nodejs";
export const maxDuration = 300;

const reparacionSchema = z
  .object({
    eventoProveedorIds: z.array(z.string().min(1).max(160)).min(1).max(200).optional()
  })
  .strict();

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const input = reparacionSchema.safeParse(await request.json().catch(() => null));
  if (!input.success) {
    return NextResponse.json({ error: "Solicitud de reparación inválida." }, { status: 400 });
  }
  try {
    const result = await repararPlanillasAsistenciaVacias(input.data.eventoProveedorIds);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "private, no-store, max-age=0" }
    });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
