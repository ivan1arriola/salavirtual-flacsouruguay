import { NextResponse } from "next/server";
import { auth } from "@/auth";

export const runtime = "nodejs";

/**
 * Migración por encuentro suelto, retirada: con un solo enlace por serie la unidad de migración
 * es la serie, y migrar un encuentro aislado la dejaría mixta.
 */
export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return NextResponse.json(
    { error: "La migración se aplica por serie: usa la migración por serie." },
    { status: 409 }
  );
}
