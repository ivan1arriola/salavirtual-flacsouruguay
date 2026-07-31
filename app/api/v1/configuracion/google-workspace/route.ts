import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cifrarConfiguracion } from "@/src/lib/config/encryption";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { actualizarSeccionGoogleWorkspace } from "@/src/modules/configuracion/google-workspace.service";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const configuracion = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal" },
    select: {
      serviceAccountEmail: true,
      serviceAccountSubject: true,
      driveDestinationId: true,
      privateKeyCifrada: true,
      activa: true,
      version: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    configuracion: configuracion
      ? {
          serviceAccountEmail: configuracion.serviceAccountEmail,
          serviceAccountSubject: configuracion.serviceAccountSubject,
          driveDestinationId: configuracion.driveDestinationId,
          activa: configuracion.activa,
          version: configuracion.version,
          updatedAt: configuracion.updatedAt,
          privateKeyConfigurada: Boolean(configuracion.privateKeyCifrada)
        }
      : null
  });
}

export async function PUT(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    const configuracion = await actualizarSeccionGoogleWorkspace(
      { db, cifrar: cifrarConfiguracion },
      actor,
      input
    );

    return NextResponse.json({
      configuracion: {
        ...configuracion,
        privateKeyConfigurada: true
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Configuracion invalida.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
