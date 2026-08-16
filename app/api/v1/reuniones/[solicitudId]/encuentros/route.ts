import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import {
  provisionarEventosMeet,
  sincronizarEventosPendientes,
  type ProvisionResult,
} from "@/src/modules/meet/provisionar-eventos.service";
import { agregarEncuentro, eliminarReunionCompleta } from "@/src/modules/reuniones/gestionar-encuentros.service";

type RouteContext = Readonly<{ params: Promise<{ solicitudId: string }> }>;

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { solicitudId } = await context.params;
    const result = await agregarEncuentro(
      { db },
      actor,
      solicitudId,
      await request.json().catch(() => null),
    );
    const provisionamiento = await provisionarEventosMeet(
      { db, descifrar: descifrarConfiguracion, crearProvider: crearGoogleCalendarProvider },
      [result.eventoProveedorId],
    );
    return NextResponse.json({ ...result, provisionamiento }, { status: 201 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function DELETE(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { solicitudId } = await context.params;
    const local = await eliminarReunionCompleta({ db }, actor, solicitudId);
    const sincronizacion = await sincronizarEventosPendientes(
      { db, descifrar: descifrarConfiguracion, crearProvider: crearGoogleCalendarProvider },
      local.eventoProveedorIds,
    );
    return NextResponse.json({
      message: "Reunión eliminada.",
      warning: advertenciaSincronizacion(sincronizacion),
      sincronizacion,
    });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

function advertenciaSincronizacion(results: readonly ProvisionResult[]): string | null {
  return results.some(({ estado }) => estado !== "SINCRONIZADA")
    ? "La reunión quedó cancelada en la aplicación, pero Google todavía tiene cancelaciones pendientes."
    : null;
}
