import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { cifrarConfiguracion, descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  guardarConfiguracionZoom,
  obtenerCredencialesZoom,
} from "@/src/modules/configuracion/zoom-config.service";
import { obtenerZoomAccessToken } from "@/src/integrations/zoom/zoom-client";

export const runtime = "nodejs";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email,
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  }

  return actor;
}

export async function GET() {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) {
    return actor;
  }

  const config = await db.configuracionZoom.findUnique({
    where: { id: "principal" },
    select: {
      accountId: true,
      clientId: true,
      clientSecretCifrado: true,
      activa: true,
      updatedAt: true,
    },
  });

  return NextResponse.json({
    configuracion: config
      ? {
          accountId: config.accountId ?? "",
          clientId: config.clientId ?? "",
          clientSecretConfigurado: Boolean(config.clientSecretCifrado),
          activa: config.activa,
          updatedAt: config.updatedAt,
        }
      : null,
  });
}

export async function PUT(request: Request) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) {
    return actor;
  }

  try {
    const body = await request.json();
    const result = await guardarConfiguracionZoom(db, cifrarConfiguracion, actor.id, body);
    return NextResponse.json(result);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al guardar configuración de Zoom.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}

export async function POST(request: Request) {
  const actor = await requireAdmin();
  if (actor instanceof NextResponse) {
    return actor;
  }

  try {
    const body = await request.json().catch(() => ({}));
    let accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
    let clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
    let clientSecret = typeof body.clientSecret === "string" ? body.clientSecret.trim() : "";

    if (!accountId || !clientId || !clientSecret) {
      // Intentar obtener desde DB si no se enviaron explícitamente en el test
      const creds = await obtenerCredencialesZoom(db, descifrarConfiguracion);
      if (creds.disponible) {
        accountId = accountId || creds.accountId;
        clientId = clientId || creds.clientId;
        clientSecret = clientSecret || creds.clientSecret;
      }
    }

    if (!accountId || !clientId || !clientSecret) {
      return NextResponse.json(
        { error: "Complete Account ID, Client ID y Client Secret para probar la conexión." },
        { status: 400 },
      );
    }

    const token = await obtenerZoomAccessToken({
      accountId,
      clientId,
      clientSecret,
    });

    return NextResponse.json({
      ok: true,
      message: "Conexión exitosa con Zoom Server-to-Server OAuth.",
      tokenGenerado: Boolean(token),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Error al conectar con la API de Zoom.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
