import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { solicitarRecuperacionZoom } from "@/src/bootstrap/zoom-historico.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
export const maxDuration = 300;

const SIN_CACHE = { "Cache-Control": "private, no-store, max-age=0" };

type Cuerpo = Readonly<{ anfitrionIds: string[]; desde: string; hasta: string; dryRun: boolean }>;

function leerCuerpo(valor: unknown): Cuerpo | null {
  if (!valor || typeof valor !== "object") {
    return null;
  }
  const v = valor as Record<string, unknown>;
  const ids = v["anfitrionIds"] ?? [];
  if (
    !Array.isArray(ids) ||
    ids.length > 100 ||
    ids.some((i) => typeof i !== "string" || i.length === 0 || i.length > 128)
  ) {
    return null;
  }
  if (typeof v["desde"] !== "string" || typeof v["hasta"] !== "string") {
    return null;
  }
  // Por defecto es una simulación: aplicar exige pedirlo de forma explícita.
  if (v["dryRun"] !== undefined && typeof v["dryRun"] !== "boolean") {
    return null;
  }
  return {
    anfitrionIds: ids as string[],
    desde: v["desde"],
    hasta: v["hasta"],
    dryRun: v["dryRun"] !== false,
  };
}

/** Simula (por defecto) o encola una recuperación histórica de archivos de Zoom. Solo administración; nunca transfiere por HTTP. */
export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  if (actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cuerpo = leerCuerpo(await request.json().catch(() => null));
  if (!cuerpo) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    const r = await solicitarRecuperacionZoom({ id: actor.id, rol: actor.rol }, cuerpo);
    switch (r.tipo) {
      case "PROHIBIDO":
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      case "PETICION_INVALIDA":
        return NextResponse.json(
          { error: "Petición inválida.", motivo: r.motivo },
          { status: 400 },
        );
      case "ZOOM_NO_CONFIGURADO":
        return NextResponse.json({ error: "Zoom no está configurado." }, { status: 409 });
      case "DRY_RUN":
        return NextResponse.json(r, { status: 200, headers: SIN_CACHE });
      case "ENCOLADA":
        return NextResponse.json(r, { status: 202, headers: SIN_CACHE });
    }
  } catch {
    return NextResponse.json({ error: "No se pudo crear la recuperación." }, { status: 500 });
  }
}
