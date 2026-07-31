import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { crearGoogleMeetArtifactsClient } from "@/src/modules/meet/google-meet-artifacts.adapter";
import { sincronizarArtefactosMeet } from "@/src/modules/meet/sincronizar-artefactos.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  return executeSynchronization();
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return executeSynchronization();
}

async function executeSynchronization() {
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const baseWhere = {
    proveedor: { tipo: "GOOGLE_MEET" as const },
    estadoIntegracion: "SINCRONIZADA" as const,
    instancia: {
      finProgramadoAt: { gte: since, lte: new Date() },
      estado: { not: "CANCELADA" as const }
    }
  };
  const pending = await db.eventoProveedor.findMany({
    where: {
      ...baseWhere,
      OR: [{ archivosSincronizadosAt: null }, { errorArchivos: { not: null } }]
    },
    orderBy: { instancia: { finProgramadoAt: "asc" } },
    take: 25,
    select: { id: true }
  });
  const cutoff = new Date(Date.now() - 6 * 60 * 60 * 1000);
  const review = pending.length < 25
    ? await db.eventoProveedor.findMany({
        where: {
          ...baseWhere,
          id: { notIn: pending.map(({ id }) => id) },
          archivosSincronizadosAt: { lte: cutoff },
          errorArchivos: null
        },
        orderBy: { archivosSincronizadosAt: "asc" },
        take: 25 - pending.length,
        select: { id: true }
      })
    : [];
  const events = [...pending, ...review];
  const results = await sincronizarArtefactosMeet(
    {
      db,
      descifrar: descifrarConfiguracion,
      crearClient: crearGoogleMeetArtifactsClient
    },
    events.map(({ id }) => id)
  );
  return NextResponse.json({
    procesadas: results.length,
    sincronizadas: results.filter(({ estado }) => estado === "SINCRONIZADO").length,
    pendientes: results.filter(({ estado }) => estado === "PENDIENTE").length,
    errores: results.filter(({ estado }) => estado === "ERROR").length,
    archivos: results.reduce((total, result) => total + result.archivos, 0)
  });
}
