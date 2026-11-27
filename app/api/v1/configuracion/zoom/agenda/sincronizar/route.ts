import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { sincronizarAgendaZoomCompleta } from "@/src/bootstrap/zoom-agenda.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const NO_CACHE = { "Cache-Control": "private, no-store" };

/**
 * Pull periódico (timer de systemd, cada 30 minutos): mantiene la agenda observada al día aunque se pierda
 * un webhook. Responde 502 si alguna cuenta no se pudo consultar, para que quede en el journal.
 */
export async function GET(request: Request) {
  const secret = process.env["CRON_SECRET"];
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401, headers: NO_CACHE });
  }
  try {
    const resultado = await sincronizarAgendaZoomCompleta();
    if (resultado.tipo === "ERROR") {
      return NextResponse.json(
        { error: "Zoom no está configurado." },
        { status: 503, headers: NO_CACHE },
      );
    }
    const fallidas = resultado.resultados.filter(({ ok }) => !ok).length;
    return NextResponse.json(resultado, { status: fallidas ? 502 : 200, headers: NO_CACHE });
  } catch (error) {
    console.error("[zoom] Falló la sincronización periódica de la agenda", error);
    return NextResponse.json(
      { error: "No se pudo sincronizar con Zoom." },
      { status: 502, headers: NO_CACHE },
    );
  }
}

/** Pull manual de la agenda de Zoom (solo administración). Los webhooks la mantienen al día entre pulls. */
export async function POST() {
  const session = await auth();
  const actor = session?.user
    ? await resolveSessionActor(db, { id: session.user.id, email: session.user.email })
    : null;
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403, headers: NO_CACHE });
  }
  try {
    const resultado = await sincronizarAgendaZoomCompleta();
    if (resultado.tipo === "ERROR") {
      return NextResponse.json(
        { error: "Zoom no está configurado." },
        { status: 503, headers: NO_CACHE },
      );
    }
    return NextResponse.json(resultado, { headers: NO_CACHE });
  } catch {
    return NextResponse.json(
      { error: "No se pudo sincronizar con Zoom. Probá de nuevo más tarde." },
      { status: 502, headers: NO_CACHE },
    );
  }
}
