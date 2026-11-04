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
import { intentarSincronizacionCalendarioAsistente } from "@/src/modules/asistencia/calendario-asistente-safe.service";
import {
  hayErroresSincronizacionCalendarioAsistente,
  sincronizarCalendarioAsistenteInstancia,
} from "@/src/modules/asistencia/calendario-asistente.service";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";
import type { ProvisionConferenciaResult } from "@/src/modules/conferencias/api";
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

    const sincronizacion = await obtenerServicioConferencias()
      .sincronizarEventosPendientes(local.eventoProveedorIds);
    const intentoCalendario = await intentarSincronizacionCalendarioAsistente(() =>
      sincronizarCalendarioAsistenteInstancia({
        db,
        descifrar: descifrarConfiguracion,
        publicarEvento: publicarEventoCalendarioAsistente,
        eliminarEvento: eliminarEventoCalendarioAsistente,
      }, instanciaId)
    );
    const calendarioAsistente = intentoCalendario.resultados;
    const warning = advertenciaSincronizacion(
      sincronizacion,
      calendarioAsistente,
      intentoCalendario.error,
    );
    const hasPending = sincronizacion.some(({ estado }) => estado !== "SINCRONIZADA") ||
      intentoCalendario.error !== null ||
      hayErroresSincronizacionCalendarioAsistente(calendarioAsistente);

    return NextResponse.json({
      message: method === "DELETE" ? "Encuentro eliminado." : "Encuentro actualizado.",
      warning,
      sincronizacion,
      calendarioAsistente,
    }, { status: hasPending ? 202 : 200 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

function advertenciaSincronizacion(
  results: readonly ProvisionConferenciaResult[],
  calendarioAsistente: readonly Readonly<{ estado: string }>[],
  errorCalendario: string | null,
): string | null {
  const warnings: string[] = [];
  if (results.some(({ estado }) => estado !== "SINCRONIZADA")) {
    warnings.push("El cambio quedó guardado en la aplicación, pero la sincronización de la reunión todavía tiene pendientes.");
  }
  if (errorCalendario || calendarioAsistente.some(({ estado }) => estado === "ERROR")) {
    warnings.push("El calendario del asistente técnico todavía tiene sincronizaciones pendientes.");
  }
  return warnings.length > 0 ? warnings.join(" ") : null;
}
