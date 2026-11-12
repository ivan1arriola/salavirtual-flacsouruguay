import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { obtenerReunionOperativa } from "@/src/bootstrap/reunion-operativa.server";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerZoomAccessToken } from "@/src/integrations/zoom/zoom-client";

export const runtime = "nodejs";
const headers = { "Cache-Control": "no-store" };
type Context = { params: Promise<{ instanciaId: string }> };

async function contextFor(id: string) {
  const session = await auth();
  if (!session?.user) {
    return null;
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return null;
  }
  const result = await obtenerReunionOperativa({ id: actor.id, rol: actor.rol }, id);
  if (result.estado !== "OK" || result.reunion.proveedorActivo !== "ZOOM" || !result.reunion.zoom.id) {
    return null;
  }
  const creds = await obtenerCredencialesZoom(db, descifrarConfiguracion);
  if (!creds.disponible) {
    throw new Error("No hay credenciales de Zoom disponibles.");
  }
  return { token: await obtenerZoomAccessToken(creds), meetingId: result.reunion.zoom.id };
}

async function fetchZoom(token: string, meetingId: string) {
  const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(meetingId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(8000)
  });
  if (!response.ok) {
    throw new Error(`Zoom no permitió consultar la reunión (${response.status}).`);
  }
  return response.json() as Promise<{ password?: string; settings?: { meeting_authentication?: boolean } }>;
}

export async function GET(_request: Request, { params }: Context) {
  try {
    const ctx = await contextFor((await params).instanciaId);
    if (!ctx) {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403, headers });
    }
    const data = await fetchZoom(ctx.token, ctx.meetingId);
    const code = typeof data.password === "string" ? data.password : null;
    return NextResponse.json({ enabled: code === null ? null : code.length > 0, code }, { headers });
  } catch {
    return NextResponse.json({ error: "No se pudo consultar el código en Zoom." }, { status: 502, headers });
  }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const ctx = await contextFor((await params).instanciaId);
    if (!ctx) {
      return NextResponse.json({ error: "Acceso no autorizado." }, { status: 403, headers });
    }
    const body = await request.json().catch(() => null);
    if (typeof body?.enabled !== "boolean") {
      return NextResponse.json({ error: "Estado inválido." }, { status: 400, headers });
    }
    const before = await fetchZoom(ctx.token, ctx.meetingId);
    const current = typeof before.password === "string" ? before.password : null;
    if (current === null) {
      return NextResponse.json(
        { error: "Zoom no informa el código; no se puede modificar con seguridad." },
        { status: 409, headers }
      );
    }
    if (body.enabled === current.length > 0) {
      return NextResponse.json({ enabled: body.enabled }, { headers });
    }
    const password = body.enabled ? crypto.randomUUID().replaceAll("-", "").slice(0, 10) : "";
    const response = await fetch(`https://api.zoom.us/v2/meetings/${encodeURIComponent(ctx.meetingId)}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${ctx.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
      cache: "no-store",
      signal: AbortSignal.timeout(8000)
    });
    if (!response.ok) {
      return NextResponse.json(
        { error: "Zoom rechazó el cambio. Puede existir una política que obligue a usar código de acceso." },
        { status: 409, headers }
      );
    }
    const after = await fetchZoom(ctx.token, ctx.meetingId);
    const actual = typeof after.password === "string" ? after.password : null;
    if (actual === null || actual.length > 0 !== body.enabled) {
      return NextResponse.json(
        { error: "Zoom no confirmó el estado solicitado. Revisá la configuración en Zoom." },
        { status: 409, headers }
      );
    }
    return NextResponse.json({ enabled: body.enabled }, { headers });
  } catch {
    return NextResponse.json(
      { error: "No se pudo modificar el código de acceso en Zoom." },
      { status: 502, headers }
    );
  }
}
