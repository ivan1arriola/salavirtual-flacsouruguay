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
  const fourHoursAgo = new Date(now.getTime() - 4 * 60 * 60 * 1000);
  const fortyEightHoursAgo = new Date(now.getTime() - 48 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const baseWhere = {
    proveedor: { tipo: "GOOGLE_MEET" as const },
    codigoReunion: { not: null },
    instancia: {
      estado: { not: "CANCELADA" as const }
    }
  };

  const limit = 25;

  // 1. Ventana Caliente (0 a 4 horas): prioridad alta para capturar artefactos frescos
  const hotEvents = await db.eventoProveedor.findMany({
    where: {
      ...baseWhere,
      archivosSincronizadosAt: null,
      instancia: {
        ...baseWhere.instancia,
        finProgramadoAt: { gte: fourHoursAgo, lte: now }
      }
    },
    orderBy: { instancia: { finProgramadoAt: "desc" } },
    take: limit,
    select: { id: true }
  });

  const remainingAfterHot = limit - hotEvents.length;

  // 2. Ventana Intermedia (4 a 48 horas): reuniones con artefactos aún pendientes o con error a reintentar
  const intermediateEvents = remainingAfterHot > 0
    ? await db.eventoProveedor.findMany({
        where: {
          ...baseWhere,
          OR: [{ archivosSincronizadosAt: null }, { errorArchivos: { not: null } }],
          instancia: {
            ...baseWhere.instancia,
            finProgramadoAt: { gte: fortyEightHoursAgo, lt: fourHoursAgo }
          }
        },
        orderBy: { instancia: { finProgramadoAt: "asc" } },
        take: remainingAfterHot,
        select: { id: true }
      })
    : [];

  const remainingAfterIntermediate = remainingAfterHot - intermediateEvents.length;

  // 3. Ventana de Cierre (> 48 horas hasta 30 días): finalizar ciclo limpiamente
  const closingEvents = remainingAfterIntermediate > 0
    ? await db.eventoProveedor.findMany({
        where: {
          ...baseWhere,
          archivosSincronizadosAt: null,
          instancia: {
            ...baseWhere.instancia,
            finProgramadoAt: { gte: thirtyDaysAgo, lt: fortyEightHoursAgo }
          }
        },
        orderBy: { instancia: { finProgramadoAt: "asc" } },
        take: remainingAfterIntermediate,
        select: { id: true }
      })
    : [];

  const eventIds = [...hotEvents, ...intermediateEvents, ...closingEvents].map(({ id }) => id);
  const results = await sincronizarArtefactosMeet(
    {
      db,
      descifrar: descifrarConfiguracion,
      crearClient: crearGoogleMeetArtifactsClient
    },
    eventIds
  );

  return NextResponse.json({
    timestamp: now.toISOString(),
    ventanas: {
      caliente: hotEvents.length,
      intermedia: intermediateEvents.length,
      cierre: closingEvents.length
    },
    procesadas: results.length,
    sincronizadas: results.filter(({ estado }) => estado === "SINCRONIZADO").length,
    sinRegistroFinalizado: results.filter(({ estado }) => estado === "SIN_REGISTRO_FINALIZADO").length,
    artefactosPendientes: results.filter(({ estado }) => estado === "ARTEFACTOS_PENDIENTES").length,
    grabacionesPendientes: results.filter(({ grabacion }) => grabacion === "PENDIENTE").length,
    noGrabadas: results.filter(({ grabacion }) => grabacion === "NO_REALIZADA").length,
    errores: results.filter(({ estado }) => estado === "ERROR").length,
    archivos: results.reduce((total, result) => total + result.archivos, 0)
  });
}
