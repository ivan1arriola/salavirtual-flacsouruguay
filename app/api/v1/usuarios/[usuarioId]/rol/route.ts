import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { cambiarRolUsuario } from "@/src/modules/usuarios/gestion-roles.service";

export const runtime = "nodejs";

type RouteContext = Readonly<{
  params: Promise<{ usuarioId: string }>;
}>;

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email,
  });
  if (!actor) {
    return NextResponse.json(
      { error: "La sesion esta desactualizada. Volve a iniciar sesion." },
      { status: 401 },
    );
  }

  try {
    const { usuarioId } = await context.params;
    const rol = await cambiarRolUsuario(db, actor, usuarioId, await request.json());
    return NextResponse.json({ usuarioId, rol });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Datos invalidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
