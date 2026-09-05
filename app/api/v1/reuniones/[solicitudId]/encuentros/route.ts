import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import {
  eliminarEventoCalendarioAsistente,
  publicarEventoCalendarioAsistente,
} from "@/src/modules/asistencia/calendario-asistente-google.adapter";
import {
  hayErroresSincronizacionCalendarioAsistente,
  sincronizarCalendariosAsistenteSolicitud,
} from "@/src/modules/asistencia/calendario-asistente.service";
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
    return NextResponse.json(
      { ...result, provisionamiento },
      { status: provisionamiento.some(({ estado }) => estado !== "SINCRONIZADA") ? 202 : 201 },
    );
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
    const calendarioAsistente = await sincronizarCalendariosAsistenteSolicitud({
      db,
      descifrar: descifrarConfiguracion,
      publicarEvento: publicarEventoCalendarioAsistente,
      eliminarEvento: eliminarEventoCalendarioAsistente,
    }, solicitudId);
    const hasPending = sincronizacion.some(({ estado }) => estado !== "SINCRONIZADA") ||
      hayErroresSincronizacionCalendarioAsistente(calendarioAsistente);

    return NextResponse.json({
      message: "Reunión eliminada.",
      warning: advertenciaSincronizacion(sincronizacion, calendarioAsistente),
      sincronizacion,
      calendarioAsistente,
    }, { status: hasPending ? 202 : 200 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

function advertenciaSincronizacion(
  results: readonly ProvisionResult[],
  calendarioAsistente: readonly Readonly<{ estado: string }>[],
): string | null {
  const warnings: string[] = [];
  if (results.some(({ estado }) => estado !== "SINCRONIZADA")) {
    warnings.push("La reunión quedó cancelada en la aplicación, pero Google Meet todavía tiene cancelaciones pendientes.");
  }
  if (calendarioAsistente.some(({ estado }) => estado === "ERROR")) {
    warnings.push("Los calendarios de asistentes técnicos todavía tienen cancelaciones pendientes.");
  }
  return warnings.length > 0 ? warnings.join(" ") : null;
}
