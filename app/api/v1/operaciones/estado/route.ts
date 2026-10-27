import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { evaluarSaludOperativa } from "@/src/modules/operaciones/salud.domain";
import { FILTRO_PROVEEDOR_OPERATIVO } from "@/src/modules/conferencias/proveedores";

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
  const pendiente = { proveedor: FILTRO_PROVEEDOR_OPERATIVO, operacionPendiente: { not: null } };
  const [pendingGoogle, googleErrors, staleClaims, oldest, uncertainPosts, stuckPosts, reservedPosts] = await Promise.all([
    db.eventoProveedor.count({ where: pendiente }),
    db.eventoProveedor.count({ where: { ...pendiente, estadoIntegracion: "ERROR" } }),
    db.eventoProveedor.count({
      where: { ...pendiente, reclamoIntegracionAt: { lt: new Date(now.getTime() - 10 * 60_000) } }
    }),
    db.eventoProveedor.findFirst({
      where: pendiente,
      orderBy: { updatedAt: "asc" },
      select: { updatedAt: true }
    }),
    db.googleOperacionExterna.count({ where: { estado: "INCIERTA" } }),
    db.googleOperacionExterna.count({
      where: { estado: "ENVIANDO", iniciadaAt: { lt: new Date(now.getTime() - 2 * 60_000) } }
    }),
    db.googleOperacionExterna.count({
      where: { estado: "RESERVADA", createdAt: { lt: new Date(now.getTime() - 15 * 60_000) } }
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

  const status = uncertainPosts > 0 || stuckPosts > 0
    ? "critico"
    : reservedPosts > 0 && health.status === "ok"
      ? "degradado"
      : health.status;

  return NextResponse.json({
    ...health,
    status,
    googlePost: {
      inciertas: uncertainPosts,
      enviandoObsoletas: stuckPosts,
      reservadasAtrasadas: reservedPosts
    },
    checkedAt: now.toISOString(),
    note: "Antigüedad aproximada desde el último cambio del evento; no desde su creación."
  }, {
    status: status === "critico" ? 503 : 200,
    headers: { "Cache-Control": "no-store" }
  });
}
