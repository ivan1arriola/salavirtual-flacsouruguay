import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";

export const runtime = "nodejs";

const payloadSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.literal("descartar"),
    eventoProveedorId: z.string().min(1)
  }),
  z.object({
    accion: z.literal("descartar-no-bloqueantes")
  }),
  z.object({
    accion: z.literal("reclasificar")
  })
]);

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const body = await request.json().catch(() => null);
    const parsed = payloadSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Payload inválido." }, { status: 400 });
    }

    switch (parsed.data.accion) {
      case "descartar": {
        const result = await obtenerServicioConferencias().descartarOperacionPendiente(parsed.data.eventoProveedorId);
        if (!result.descartada) {
          return NextResponse.json({ error: result.motivo ?? "No se pudo descartar la operación." }, { status: 400 });
        }
        return NextResponse.json({ ok: true, resultado: result });
      }
      case "descartar-no-bloqueantes": {
        const result = await obtenerServicioConferencias().descartarOperacionesNoBloqueantesLote();
        return NextResponse.json({ ok: true, resultado: result });
      }
      case "reclasificar": {
        const result = await obtenerServicioConferencias().reclasificarOperacionesPendientesLote();
        return NextResponse.json({ ok: true, resultado: result });
      }
    }
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
