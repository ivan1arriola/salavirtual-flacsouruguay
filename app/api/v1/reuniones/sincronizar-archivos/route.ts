import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { sincronizarArtefactosOperativos } from "@/src/bootstrap/archivos.server";
import { puedeSincronizarGrabaciones } from "@/src/modules/meet/grabaciones.domain";

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
  const { resultados, timestamp, ventanas } = await sincronizarArtefactosOperativos();

  return NextResponse.json({
    timestamp,
    ventanas,
    procesadas: resultados.length,
    sincronizadas: resultados.filter(({ estado }) => estado === "SINCRONIZADO").length,
    sinRegistroFinalizado: resultados.filter(({ estado }) => estado === "SIN_REGISTRO_FINALIZADO").length,
    artefactosPendientes: resultados.filter(({ estado }) => estado === "ARTEFACTOS_PENDIENTES").length,
    grabacionesPendientes: resultados.filter(({ grabacion }) => grabacion === "PENDIENTE").length,
    noGrabadas: resultados.filter(({ grabacion }) => grabacion === "NO_REALIZADA").length,
    errores: resultados.filter(({ estado }) => estado === "ERROR").length,
    archivos: resultados.reduce((total, result) => total + result.archivos, 0)
  });
}
