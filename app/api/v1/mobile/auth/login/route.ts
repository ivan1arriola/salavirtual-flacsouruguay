import { NextResponse } from "next/server";
import { authConfig } from "@/src/lib/auth/config";
import { dependenciasLoginLocal } from "@/src/lib/auth/local-login.adapter";
import { issueAssistantMobileToken } from "@/src/lib/auth/mobile-token";
import { autenticarConCredenciales } from "@/src/modules/usuarios/credentials.service";

export async function POST(request: Request) {
  const credentials = await request.json().catch(() => null);
  const user = await autenticarConCredenciales(dependenciasLoginLocal, credentials);

  if (!user) {
    return NextResponse.json({ error: "Usuario o contraseña incorrectos." }, { status: 401 });
  }
  if (user.rol !== "ASISTENTE_TECNICO") {
    return NextResponse.json(
      { error: "Esta aplicación está disponible únicamente para asistentes técnicos." },
      { status: 403 }
    );
  }
  if (user.debeCambiarPassword) {
    return NextResponse.json(
      {
        error: "Debés cambiar tu contraseña desde Sala Virtual antes de usar la aplicación.",
        code: "PASSWORD_CHANGE_REQUIRED"
      },
      { status: 403 }
    );
  }

  const token = issueAssistantMobileToken(user.id, authConfig.secret);
  return NextResponse.json({
    ...token,
    tokenType: "Bearer",
    user: {
      id: user.id,
      name: user.nombre,
      email: user.email,
      role: user.rol
    }
  });
}
