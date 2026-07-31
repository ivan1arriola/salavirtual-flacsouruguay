import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { reemplazarCuentasGooglePermitidas } from "@/src/modules/usuarios/cuentas-google.service";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{ usuarioId: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { usuarioId } = await context.params;
  const usuario = await db.usuario.findUnique({
    where: { id: usuarioId },
    select: {
      id: true,
      passwordHash: true,
      cuentasGoogle: {
        select: {
          email: true,
          providerAccountId: true,
          ultimoAccesoAt: true
        },
        orderBy: { email: "asc" }
      }
    }
  });
  if (!usuario) {
    return NextResponse.json({ error: "Usuario no encontrado." }, { status: 404 });
  }

  return NextResponse.json({
    usuarioId: usuario.id,
    tienePassword: Boolean(usuario.passwordHash),
    cuentas: usuario.cuentasGoogle.map((cuenta) => ({
      email: cuenta.email,
      vinculada: Boolean(cuenta.providerAccountId),
      ultimoAccesoAt: cuenta.ultimoAccesoAt
    }))
  });
}

export async function PUT(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { usuarioId } = await context.params;
  const input = await request.json().catch(() => null);

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor) {
      return NextResponse.json(
        { error: "La sesión está desactualizada. Volvé a iniciar sesión." },
        { status: 401 }
      );
    }
    const emails = await reemplazarCuentasGooglePermitidas(
      { db },
      actor,
      usuarioId,
      input
    );
    return NextResponse.json({ usuarioId, emails });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Datos invalidos.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
