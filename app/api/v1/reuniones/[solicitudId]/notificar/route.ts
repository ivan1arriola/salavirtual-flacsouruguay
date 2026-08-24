import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { renotificarSerieAlPrograma } from "@/src/modules/reuniones/renotificar-serie.service";

type RouteContext = Readonly<{ params: Promise<{ solicitudId: string }> }>;

export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { solicitudId } = await context.params;
    const result = await renotificarSerieAlPrograma(
      { db, descifrar: descifrarConfiguracion },
      actor,
      solicitudId,
    );
    return NextResponse.json({
      ...result,
      message: `Aviso reenviado a ${result.destinatarios} ${result.destinatarios === 1 ? "persona" : "personas"} del programa.`,
    });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
