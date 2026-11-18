import { NextResponse } from "next/server";
import { errorParaPanel } from "@/src/lib/http/api-error";
import { auth } from "@/auth";
import { cifrarConfiguracion } from "@/src/lib/config/encryption";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import {
  actualizarSeccionGoogleWorkspace,
  desactivarCredencialLegacyWorkspace
} from "@/src/modules/configuracion/google-workspace.service";

export const runtime = "nodejs";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Never authorize sensitive reads solely from the role saved in a JWT/session.
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [configuracion, legacy] = await Promise.all([
    db.configuracionGoogleWorkspace.findUnique({
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
    }),
    db.configuracionGoogleWorkspace.findMany({
      where: { id: { startsWith: "legacy:" } },
      orderBy: [{ activa: "desc" }, { updatedAt: "desc" }],
      select: {
        id: true,
        serviceAccountEmail: true,
        privateKeyCifrada: true,
        activa: true,
        version: true,
        updatedAt: true
      }
    })
  ]);

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
      : null,
    legacyCredentials: legacy.map((credential) => ({
      id: credential.id,
      serviceAccountEmail: credential.serviceAccountEmail,
      activa: credential.activa,
      version: credential.version,
      updatedAt: credential.updatedAt,
      privateKeyConfigurada: Boolean(credential.privateKeyCifrada)
    }))
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
    const { status, message } = errorParaPanel(error, "No se pudo guardar la configuración de Google.");
    return NextResponse.json({ error: message }, { status });
  }
}

export async function DELETE(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor || actor.rol !== "ADMINISTRACION" || !actor.activo) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const id = new URL(request.url).searchParams.get("id")?.trim();
  if (!id?.startsWith("legacy:")) {
    return NextResponse.json({ error: "Solo se pueden desactivar credenciales Legacy." }, { status: 400 });
  }
  try {
    await desactivarCredencialLegacyWorkspace(db, actor, id);
    return NextResponse.json({ message: "Credencial Legacy desactivada." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Error al desactivar la credencial.";
    const status = message === "La credencial no existe." ? 404 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
