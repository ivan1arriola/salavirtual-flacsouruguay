import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { evaluarSaludOperativa } from "@/src/modules/operaciones/salud.domain";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const isCron = Boolean(secret && request.headers.get("authorization") === "Bearer " + secret);
  if (!isCron) {
    const session = await auth();
    if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const now = new Date();
  const pendiente = { proveedor: { tipo: "GOOGLE_MEET" as const }, operacionPendiente: { not: null } };
  const [pendingGoogle, googleErrors, staleClaims, oldest] = await Promise.all([
    db.eventoProveedor.count({ where: pendiente }),
    db.eventoProveedor.count({ where: { ...pendiente, estadoIntegracion: "ERROR" } }),
    db.eventoProveedor.count({
      where: { ...pendiente, reclamoIntegracionAt: { lt: new Date(now.getTime() - 10 * 60_000) } }
    }),
    db.eventoProveedor.findFirst({
      where: pendiente,
      orderBy: { updatedAt: "asc" },
      select: { updatedAt: true }
    })
  ]);
  const health = evaluarSaludOperativa({
    pendingGoogle,
    googleErrors,
    staleClaims,
    oldestPendingMinutes: oldest
      ? Math.max(0, Math.floor((now.getTime() - oldest.updatedAt.getTime()) / 60_000))
      : null
  });

  return NextResponse.json({
    ...health,
    checkedAt: now.toISOString(),
    note: "Antigüedad aproximada desde el último cambio del evento; no desde su creación."
  }, {
    status: health.status === "critico" ? 503 : 200,
    headers: { "Cache-Control": "no-store" }
  });
}
