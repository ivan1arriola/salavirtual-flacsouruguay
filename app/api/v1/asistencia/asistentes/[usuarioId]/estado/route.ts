import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { actualizarEstadoOperativoAsistente } from "@/src/modules/usuarios/estado-asistente.service";

export const runtime = "nodejs";

export async function PATCH(
  request: Request,
  context: Readonly<{ params: Promise<{ usuarioId: string }> }>
) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { usuarioId } = await context.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "Solicitud inválida." }, { status: 400 });
  }

  try {
    const estado = await actualizarEstadoOperativoAsistente(
      db,
      actor,
      usuarioId,
      {
        disponibleGeneral:
          typeof body.disponibleGeneral === "boolean"
            ? body.disponibleGeneral
            : undefined,
        cesadoHastaProximoInicioSesion:
          typeof body.cesadoHastaProximoInicioSesion === "boolean"
            ? body.cesadoHastaProximoInicioSesion
            : undefined
      }
    );

    return NextResponse.json({ ok: true, estado });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "No se pudo actualizar el estado operativo."
      },
      { status: 400 }
    );
  }
}
