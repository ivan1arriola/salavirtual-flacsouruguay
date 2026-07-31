import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { cifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { actualizarConfiguracionGoogleWorkspace } from "@/src/modules/configuracion/google-workspace.service";

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
      activa: true,
      version: true,
      updatedAt: true
    }
  });

  return NextResponse.json({
    configuracion: configuracion
      ? { ...configuracion, privateKeyConfigurada: true }
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
    const configuracion = await actualizarConfiguracionGoogleWorkspace(
      { db, cifrar: cifrarConfiguracion },
      {
        id: session.user.id,
        rol: session.user.role,
        activo: true
      },
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
