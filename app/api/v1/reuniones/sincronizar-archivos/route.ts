import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { puedeSincronizarGrabaciones } from "@/src/modules/meet/grabaciones.domain";
import { crearGoogleMeetArtifactsClient } from "@/src/modules/meet/google-meet-artifacts.adapter";
import { sincronizarArtefactosMeet } from "@/src/modules/meet/sincronizar-artefactos.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST() {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await resolveSessionActor(db, {
    id: session.user.id,
    email: session.user.email
  });
  if (!actor?.activo || !puedeSincronizarGrabaciones(actor.rol)) {
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
  const now = new Date();
  const since = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
  const baseWhere = {
    proveedor: { tipo: "GOOGLE_MEET" as const },
    codigoReunion: { not: null },
    instancia: {
      finProgramadoAt: { gte: since, lte: now },
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
    sinRegistroFinalizado: results.filter(({ estado }) => estado === "SIN_REGISTRO_FINALIZADO").length,
    artefactosPendientes: results.filter(({ estado }) => estado === "ARTEFACTOS_PENDIENTES").length,
    errores: results.filter(({ estado }) => estado === "ERROR").length,
    archivos: results.reduce((total, result) => total + result.archivos, 0)
  });
}
