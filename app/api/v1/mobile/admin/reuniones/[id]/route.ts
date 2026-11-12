import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { getAdminMeeting } from "@/src/modules/mobile-admin/queries.adapter";
import { actualizarEncuentro } from "@/src/modules/reuniones/gestionar-encuentros.service";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";
import { toHttpError } from "@/src/lib/http/api-error";
import {
  hayErroresSincronizacionCalendarioAsistente,
  sincronizarCalendarioAsistenteInstancia
} from "@/src/modules/asistencia/calendario-asistente.service";
import {
  eliminarEventoCalendarioAsistente,
  publicarEventoCalendarioAsistente
} from "@/src/modules/asistencia/calendario-asistente-google.adapter";
import { intentarSincronizacionCalendarioAsistente } from "@/src/modules/asistencia/calendario-asistente-safe.service";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, context: RouteContext) {
  try {
    await requireMobileActor(request, ["ADMINISTRACION"]);
    const { id } = await context.params;
    if (!id || id.length > 128) {
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    }
    const meeting = await getAdminMeeting(db, id);
    if (!meeting) {
      return NextResponse.json({ error: "Encuentro no encontrado." }, { status: 404 });
    }
    return NextResponse.json({ meeting });
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}

const ALLOWED_ACTIONS = new Set(["CAMBIAR_MODALIDAD", "CAMBIAR_ASISTENCIA", "EDITAR_HORARIO_ASISTENCIA"]);

/** Mutations reuse the web application's authorization, audit and business rules. */
export async function POST(request: Request, context: RouteContext) {
  try {
    const actor = await requireMobileActor(request, ["ADMINISTRACION"]);
    const { id } = await context.params;
    if (!id || id.length > 128) {
      return NextResponse.json({ error: "Identificador inválido." }, { status: 400 });
    }
    const input = await request.json().catch(() => null);
    if (
      !input ||
      typeof input !== "object" ||
      typeof input.accion !== "string" ||
      !ALLOWED_ACTIONS.has(input.accion)
    ) {
      return NextResponse.json({ error: "Acción administrativa inválida." }, { status: 400 });
    }

    const meeting = await getAdminMeeting(db, id);
    if (!meeting) {
      return NextResponse.json({ error: "Encuentro no encontrado." }, { status: 404 });
    }
    if (input.accion === "EDITAR_HORARIO_ASISTENCIA") {
      if (meeting.modality !== "HIBRIDA") {
        return NextResponse.json(
          { error: "La cobertura virtual es fija y no se puede editar." },
          { status: 400 }
        );
      }
      const arrival = Date.parse(input.inicioAsistenciaTecnica);
      const departure = Date.parse(input.finAsistenciaTecnica);
      if (
        !Number.isFinite(arrival) ||
        !Number.isFinite(departure) ||
        arrival > Date.parse(meeting.startsAt) - 30 * 60_000 ||
        departure < Date.parse(meeting.endsAt) + 30 * 60_000
      ) {
        return NextResponse.json(
          { error: "La asistencia híbrida requiere al menos 30 minutos antes y después del encuentro." },
          { status: 400 }
        );
      }
    }
    const result = await actualizarEncuentro({ db }, actor, meeting.requestId, id, input);
    const sincronizacion = await obtenerServicioConferencias().sincronizarEventosPendientes(
      result.eventoProveedorIds
    );
    const calendario = await intentarSincronizacionCalendarioAsistente(() =>
      sincronizarCalendarioAsistenteInstancia(
        {
          db,
          descifrar: descifrarConfiguracion,
          publicarEvento: publicarEventoCalendarioAsistente,
          eliminarEvento: eliminarEventoCalendarioAsistente
        },
        id
      )
    );
    const incomplete =
      sincronizacion.some(({ estado }) => estado !== "SINCRONIZADA") ||
      calendario.error !== null ||
      hayErroresSincronizacionCalendarioAsistente(calendario.resultados);
    return NextResponse.json(
      {
        message: "Cambios guardados.",
        warning: incomplete
          ? "El cambio quedó guardado; algunas sincronizaciones con Google están pendientes."
          : null,
        meeting: await getAdminMeeting(db, id)
      },
      { status: incomplete ? 202 : 200 }
    );
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
