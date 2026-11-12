import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { sincronizarArtefactosOperativos } from "@/src/bootstrap/archivos.server";
import { estadoZoomArchivos } from "@/src/bootstrap/zoom-historico.server";
import { puedeSincronizarGrabaciones } from "@/src/modules/archivos/api";

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

  // El estado global de Zoom (incluye histórico sin vincular) es solo de administración.
  return executeSynchronization(actor.rol === "ADMINISTRACION");
}

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return executeSynchronization(true);
}

async function executeSynchronization(incluirZoom: boolean) {
  // Meet y Zoom son independientes: el fallo de uno no impide informar al otro. Zoom solo lee el estado
  // desde la base de datos; las copias de archivos las hace el worker, nunca esta petición.
  const [meet, zoomEstado] = await Promise.allSettled([
    sincronizarArtefactosOperativos(),
    incluirZoom ? estadoZoomArchivos() : Promise.resolve(null)
  ]);
  const zoom = !incluirZoom
    ? undefined
    : zoomEstado.status === "fulfilled"
      ? zoomEstado.value
      : { disponible: false as const };
  if (meet.status === "rejected") {
    return NextResponse.json({ error: "No se pudo sincronizar Meet.", zoom }, { status: 502 });
  }
  const { resultados, timestamp, ventanas } = meet.value;

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
    archivos: resultados.reduce((total, result) => total + result.archivos, 0),
    zoom
  });
}
