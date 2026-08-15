import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) {
    return NextResponse.json({ error: "La sesion esta desactualizada." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    notificationId?: string;
    all?: boolean;
  };
  const now = new Date();

  if (body.all) {
    const result = await db.notificacion.updateMany({
      where: { usuarioId: actor.id, leidaAt: null },
      data: { leidaAt: now }
    });
    return NextResponse.json({ updated: result.count });
  }

  if (!body.notificationId?.trim()) {
    return NextResponse.json({ error: "notificationId es obligatorio." }, { status: 400 });
  }

  const result = await db.notificacion.updateMany({
    where: { id: body.notificationId, usuarioId: actor.id, leidaAt: null },
    data: { leidaAt: now }
  });
  return NextResponse.json({ updated: result.count });
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo) {
    return NextResponse.json({ error: "La sesion esta desactualizada." }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    notificationId?: string;
  };
  if (!body.notificationId?.trim()) {
    return NextResponse.json({ error: "notificationId es obligatorio." }, { status: 400 });
  }

  const result = await db.notificacion.deleteMany({
    where: { id: body.notificationId, usuarioId: actor.id }
  });
  return NextResponse.json({ deleted: result.count });
}
