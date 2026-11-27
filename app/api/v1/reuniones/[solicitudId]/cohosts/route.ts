import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { sincronizarCohostsGoogleExistente } from "@/src/modules/conferencias/api";
import { actualizarCohostsSerie } from "@/src/modules/reuniones/gestionar-cohosts-serie.service";

type RouteContext = Readonly<{ params: Promise<{ solicitudId: string }> }>;

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const { solicitudId } = await context.params;
    const result = await actualizarCohostsSerie(
      {
        db,
        descifrar: descifrarConfiguracion,
        sincronizarGoogle: sincronizarCohostsGoogleExistente,
      },
      actor,
      solicitudId,
      await request.json().catch(() => null),
    );
    return NextResponse.json({
      ...result,
      message: `Cohosts actualizados en ${result.encuentros} ${result.encuentros === 1 ? "encuentro" : "encuentros"}.`,
    });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
