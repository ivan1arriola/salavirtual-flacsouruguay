import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  pruebaConfiguracionGoogleWorkspaceSchema
} from "@/src/modules/configuracion/google-workspace.domain";
import {
  probarCredencialGoogle,
  probarDelegacionGoogle,
  probarDestinoDrive
} from "@/src/modules/configuracion/google-workspace-test.adapter";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor || actor.rol !== "ADMINISTRACION" || !actor.activo) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const { objetivo } = pruebaConfiguracionGoogleWorkspaceSchema.parse(
      await request.json().catch(() => null)
    );
    const configuration = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" }
    });
    if (
      !configuration?.serviceAccountEmail ||
      !configuration.privateKeyCifrada
    ) {
      throw new Error("Primero guardá la cuenta de servicio y su clave privada.");
    }

    const credential = {
      serviceAccountEmail: configuration.serviceAccountEmail,
      privateKey: descifrarConfiguracion(configuration.privateKeyCifrada)
    };
    const message = await ejecutarPrueba(objetivo, configuration, credential);
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json(
      { error: mensajeSeguro(error) },
      { status: 400 }
    );
  }
}

async function ejecutarPrueba(
  objetivo: "CREDENCIAL" | "DELEGACION" | "DRIVE",
  configuration: Readonly<{
    serviceAccountSubject: string | null;
    driveDestinationId: string | null;
  }>,
  credential: Readonly<{ serviceAccountEmail: string; privateKey: string }>
): Promise<string> {
  if (objetivo === "CREDENCIAL") {
    return probarCredencialGoogle(credential);
  }
  if (!configuration.serviceAccountSubject) {
    throw new Error("Primero guardá el usuario delegado.");
  }
  const delegated = {
    ...credential,
    subject: configuration.serviceAccountSubject
  };
  if (objetivo === "DELEGACION") {
    return probarDelegacionGoogle(delegated);
  }
  if (!configuration.driveDestinationId) {
    throw new Error("Primero guardá el destino de Drive.");
  }
  return probarDestinoDrive(delegated, configuration.driveDestinationId);
}

function mensajeSeguro(error: unknown): string {
  return error instanceof Error
    ? error.message
    : "No se pudo completar la prueba con Google.";
}
