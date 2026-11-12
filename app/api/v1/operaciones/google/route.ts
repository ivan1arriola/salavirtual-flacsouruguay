import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Read-only administrative reconciliation queue. Never offer a blind POST retry. */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const rows = await db.googleOperacionExterna.findMany({
    where: { estado: { in: ["RESERVADA", "ENVIANDO", "INCIERTA"] } },
    orderBy: { updatedAt: "asc" },
    take: 100,
    select: {
      clave: true,
      proveedor: true,
      tipo: true,
      cuenta: true,
      referencia: true,
      estado: true,
      intentos: true,
      iniciadaAt: true,
      createdAt: true,
      updatedAt: true,
      errorCodigo: true
    }
  });
  return NextResponse.json(
    {
      operacion: "RECONCILIACION_MANUAL",
      elementos: rows,
      totalEnPagina: rows.length,
      nota: "Los resultados inciertos no deben reenviarse sin comprobar el estado remoto. Hasta 100 operaciones por página."
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
