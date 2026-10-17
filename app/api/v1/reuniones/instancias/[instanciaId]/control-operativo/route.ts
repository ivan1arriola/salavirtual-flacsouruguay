import { NextResponse } from "next/server";
import { auth } from "@/auth";
import {
  actualizarControlOperativoReunion,
  guardarRegistroAsistenciaOperativo,
  obtenerReunionOperativa
} from "@/src/bootstrap/reunion-operativa.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";

type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;

export async function GET(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { instanciaId } = await context.params;
    const result = await obtenerReunionOperativa(
      { id: actor.id, rol: actor.rol },
      instanciaId
    );
    if (result.estado === "NO_ENCONTRADA") {
      return NextResponse.json({ error: "La reunión no existe." }, { status: 404 });
    }
    if (result.estado === "PROHIBIDA") {
      return NextResponse.json({ error: "No tenés permisos para consultar esta reunión." }, { status: 403 });
    }

    return NextResponse.json({ reunion: result.reunion });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { instanciaId } = await context.params;
    const resultado = await actualizarControlOperativoReunion(
      { id: actor.id, rol: actor.rol },
      instanciaId,
      await request.json().catch(() => null)
    );

    return NextResponse.json(resultado);
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email
    });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { instanciaId } = await context.params;
    const registro = await guardarRegistroAsistenciaOperativo(
      { id: actor.id, rol: actor.rol },
      instanciaId,
      await request.json().catch(() => null)
    );

    return NextResponse.json({ registro }, { status: 201 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

