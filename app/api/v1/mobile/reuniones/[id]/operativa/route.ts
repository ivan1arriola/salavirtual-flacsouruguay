import { NextResponse } from "next/server";
import { MobileActorError, requireMobileActor } from "@/src/lib/auth/mobile-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { puedeConsultarReunionOperativa } from "@/src/modules/asistencia/reunion-operativa-access.domain";
import { obtenerReunionOperativa } from "@/src/modules/asistencia/reunion-operativa.service";
import {
  crearGoogleMeetConferenceSnapshotClient,
  getMeetConferenceSnapshot
} from "@/src/modules/meet/conference-status.adapter";

const MOBILE_ROLES = ["ASISTENTE_TECNICO", "ADMINISTRACION"] as const;
const ACTIVE_ASSIGNMENTS = ["ASIGNADO", "ACEPTADO"] as const;

type RouteContext = Readonly<{ params: Promise<{ id: string }> }>;

export async function GET(request: Request, context: RouteContext) {
  try {
    const actor = await requireMobileActor(request, MOBILE_ROLES);
    const { id } = await context.params;

    const instancia = await db.instanciaSala.findUnique({
      where: { id },
      select: { id: true }
    });
    if (!instancia) {
      return NextResponse.json({ error: "Reunión no encontrada." }, { status: 404 });
    }

    let asignado = false;
    if (actor.rol === "ASISTENTE_TECNICO") {
      const assistant = await db.asistenteTecnico.findUnique({
        where: { usuarioId: actor.id },
        select: { id: true }
      });
      if (assistant) {
        asignado = Boolean(await db.asignacionAsistente.findFirst({
          where: {
            instanciaSalaId: id,
            asistenteTecnicoId: assistant.id,
            estado: { in: [...ACTIVE_ASSIGNMENTS] }
          },
          select: { id: true }
        }));
      }
    }

    if (!puedeConsultarReunionOperativa({ rol: actor.rol, asignado })) {
      return NextResponse.json(
        { error: "No tenés una asignación activa para esta reunión." },
        { status: 403 }
      );
    }

    const reunion = await obtenerReunionOperativa({
      db,
      descifrar: descifrarConfiguracion,
      crearClient: crearGoogleMeetConferenceSnapshotClient,
      obtenerSnapshot: getMeetConferenceSnapshot
    }, id);

    return NextResponse.json({
      reunion: {
        ...reunion,
        startedAt: reunion.startedAt?.toISOString() ?? null,
        endedAt: reunion.endedAt?.toISOString() ?? null,
        participants: reunion.participants.map((participant) => ({
          ...participant,
          joinedAt: participant.joinedAt.toISOString(),
          leftAt: participant.leftAt?.toISOString() ?? null
        }))
      }
    });
  } catch (error) {
    if (error instanceof MobileActorError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    throw error;
  }
}
