import { NextResponse } from "next/server";
import { authConfig } from "@/src/lib/auth/config";
import { db } from "@/src/lib/db";
import {
  mobileActorFromRequest,
  mobileSessionHash,
  mobileSessionIdentifier
} from "@/src/lib/auth/mobile-token";

export async function POST(request: Request) {
  const token = mobileActorFromRequest(request, authConfig.secret);
  if (!token) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (token.v !== 2 || !token.sid) {
    return NextResponse.json(
      {
        error:
          "La sesión antigua no admite cierre remoto. Iniciá sesión de nuevo para utilizar sesiones revocables."
      },
      { status: 409 }
    );
  }
  await db.tokenVerificacion.deleteMany({
    where: {
      identifier: mobileSessionIdentifier(token.sub),
      token: mobileSessionHash(token.sid)
    }
  });
  return NextResponse.json({ message: "Sesión móvil cerrada." });
}
