import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { crearDependenciasMigracionZoom } from "@/src/bootstrap/migracion-zoom.server";
import {
  aplicarMigracionZoom,
  MAXIMO_LOTE_MIGRACION_ZOOM,
} from "@/src/modules/reuniones/migracion-zoom-aplicar.service";
import { reunionCompartidaHabilitada } from "@/src/modules/reuniones/reunion-compartida.domain";

export const runtime = "nodejs";
export const maxDuration = 300;

const bodySchema = z.object({
  modo: z.enum(["PILOTO", "LOTE"]),
  instanciaIds: z.array(z.string().min(1)).min(1).max(MAXIMO_LOTE_MIGRACION_ZOOM),
});

/** Aplica la conversión Meet → Zoom a encuentros explícitos (piloto de uno o lote acotado). */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Con un solo enlace por serie la unidad de migración es la serie: migrar un encuentro suelto la dejaría mixta.
  if (reunionCompartidaHabilitada(process.env)) {
    return NextResponse.json(
      { error: "La migración se aplica por serie: usa la migración por serie." },
      { status: 409 },
    );
  }

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const input = bodySchema.parse(await request.json().catch(() => null));
    const resultados = await aplicarMigracionZoom(
      crearDependenciasMigracionZoom(),
      { id: actor.id, rol: actor.rol },
      input,
    );
    return NextResponse.json({ resultados }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
