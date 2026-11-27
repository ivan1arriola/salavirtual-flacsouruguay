import { NextResponse } from "next/server";
import { authConfig } from "@/src/lib/auth/config";
import { dependenciasLoginLocal } from "@/src/lib/auth/local-login.adapter";
import {
  issueMobileToken,
  mobileSessionHash,
  mobileSessionIdentifier,
} from "@/src/lib/auth/mobile-token";
import { db } from "@/src/lib/db";
import { autenticarConCredenciales } from "@/src/modules/usuarios/credentials.service";

export async function POST(request: Request) {
  const credentials = await request.json().catch(() => null);
  const user = await autenticarConCredenciales(dependenciasLoginLocal, credentials);

  if (!user) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }
  if (user.rol !== "ASISTENTE_TECNICO" && user.rol !== "ADMINISTRACION") {
    return NextResponse.json(
      {
        error:
          "Esta aplicación está disponible únicamente para asistentes de monitoreo y administración.",
      },
      { status: 403 },
    );
  }
  if (user.debeCambiarPassword) {
    return NextResponse.json(
      {
        error: "Debés cambiar tu contraseña desde Sala Virtual antes de usar la aplicación.",
        code: "PASSWORD_CHANGE_REQUIRED",
      },
      { status: 403 },
    );
  }

  const token = issueMobileToken(user.id, authConfig.secret, user.rol);
  await db.tokenVerificacion.create({
    data: {
      identifier: mobileSessionIdentifier(user.id),
      token: mobileSessionHash(token.sessionId),
      expires: new Date(token.expiresAt),
    },
  });
  return NextResponse.json({
    accessToken: token.accessToken,
    expiresAt: token.expiresAt,
    tokenType: "Bearer",
    user: {
      id: user.id,
      name: user.nombre,
      email: user.email,
      role: user.rol,
    },
  });
}
