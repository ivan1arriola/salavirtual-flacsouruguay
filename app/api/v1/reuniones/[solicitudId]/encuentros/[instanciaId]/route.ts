import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import {
  sincronizarEventosPendientes,
  type ProvisionResult,
} from "@/src/modules/meet/provisionar-eventos.service";
import { actualizarEncuentro, eliminarEncuentro } from "@/src/modules/reuniones/gestionar-encuentros.service";

type RouteContext = Readonly<{
  params: Promise<{ solicitudId: string; instanciaId: string }>;
}>;

export async function PATCH(request: Request, context: RouteContext) {
  return execute(request, context, "PATCH");
}

export async function DELETE(request: Request, context: RouteContext) {
  return execute(request, context, "DELETE");
}

async function execute(request: Request, context: RouteContext, method: "PATCH" | "DELETE") {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const { solicitudId, instanciaId } = await context.params;

    const local = method === "DELETE"
      ? await eliminarEncuentro({ db }, actor, solicitudId, instanciaId)
      : await actualizarEncuentro(
        { db },
        actor,
        solicitudId,
        instanciaId,
        await request.json().catch(() => null),
      );

    const sincronizacion = await sincronizarEventosPendientes(
      { db, descifrar: descifrarConfiguracion, crearProvider: crearGoogleCalendarProvider },
      local.eventoProveedorIds,
    );
    const warning = advertenciaSincronizacion(sincronizacion);

    return NextResponse.json({
      message: method === "DELETE" ? "Encuentro eliminado." : "Encuentro actualizado.",
      warning,
      sincronizacion,
    }, { status: sincronizacion.some(({ estado }) => estado !== "SINCRONIZADA") ? 202 : 200 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

function advertenciaSincronizacion(results: readonly ProvisionResult[]): string | null {
  const pendientes = results.filter(({ estado }) => estado !== "SINCRONIZADA");
  if (pendientes.length === 0) return null;
  return "El cambio quedó guardado en la aplicación, pero Google todavía tiene sincronizaciones pendientes.";
}
