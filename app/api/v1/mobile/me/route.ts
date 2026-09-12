import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { db } from "@/src/lib/db";

const MOBILE_ROLES = ["ASISTENTE_TECNICO", "ADMINISTRACION"] as const;

export async function GET(request: Request) {
  try {
    const actor = await requireMobileActor(request, MOBILE_ROLES);
    const user = await db.usuario.findUnique({
      where: { id: actor.id },
      select: {
        id: true,
        nombres: true,
        apellidos: true,
        emailPrincipal: true,
        rol: true
      }
    });

    if (!user) {
      throw new MobileActorError("El acceso móvil fue revocado.", 403);
    }

    return NextResponse.json({
      user: {
        id: user.id,
        name: [user.nombres, user.apellidos].filter(Boolean).join(" ") || null,
        email: user.emailPrincipal,
        role: user.rol
      }
    });
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
