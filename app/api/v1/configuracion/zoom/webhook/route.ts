import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { cifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";

const tokenSchema = z.object({
  secretToken: z.string().trim().min(1, "Ingresá el Secret Token de Zoom.").max(512)
});

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return null;
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  return actor?.activo && actor.rol === "ADMINISTRACION" ? actor : null;
}

export async function PUT(request: Request) {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  const parsed = tokenSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Ingresá un Secret Token válido (hasta 512 caracteres)." },
      { status: 400 }
    );
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.configuracionZoom.upsert({
        where: { id: "principal" },
        create: {
          id: "principal",
          webhookSecretCifrado: cifrarConfiguracion(parsed.data.secretToken),
          actualizadaPorId: actor.id
        },
        update: {
          webhookSecretCifrado: cifrarConfiguracion(parsed.data.secretToken),
          actualizadaPorId: actor.id
        }
      });
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: "ZOOM_WEBHOOK_SECRET_ACTUALIZADO",
          entidadTipo: "ConfiguracionZoom",
          entidadId: "principal",
          valorNuevo: { configurado: true }
        }
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No se pudo guardar el secreto del webhook de Zoom", error);
    return NextResponse.json({ error: "No se pudo guardar el secreto del webhook." }, { status: 503 });
  }
}

export async function DELETE() {
  const actor = await requireAdmin();
  if (!actor) {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }
  try {
    await db.$transaction(async (tx) => {
      await tx.configuracionZoom.update({
        where: { id: "principal" },
        data: { webhookSecretCifrado: null, actualizadaPorId: actor.id }
      });
      await tx.auditoria.create({
        data: {
          actorUsuarioId: actor.id,
          accion: "ZOOM_WEBHOOK_SECRET_ELIMINADO",
          entidadTipo: "ConfiguracionZoom",
          entidadId: "principal",
          valorNuevo: { configurado: false }
        }
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("No se pudo eliminar el secreto del webhook de Zoom", error);
    return NextResponse.json({ error: "No se pudo eliminar el secreto del webhook." }, { status: 503 });
  }
}
