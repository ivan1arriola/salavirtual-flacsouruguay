import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { conciliarAsistenciaZoom } from "@/src/bootstrap/zoom-asistencia.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;

const SIN_CACHE = { "Cache-Control": "private, no-store, max-age=0" };

type Cuerpo = Readonly<{
  registroId: string;
  invitadoReunionId: string | null;
  externo: boolean;
  version: number;
}>;

function leerCuerpo(valor: unknown): Cuerpo | null {
  if (!valor || typeof valor !== "object") {
    return null;
  }
  const v = valor as Record<string, unknown>;
  const invitado = v["invitadoReunionId"] ?? null;
  if (
    typeof v["registroId"] !== "string" ||
    v["registroId"].length === 0 ||
    v["registroId"].length > 64
  ) {
    return null;
  }
  if (
    invitado !== null &&
    (typeof invitado !== "string" || invitado.length === 0 || invitado.length > 64)
  ) {
    return null;
  }
  if (typeof v["externo"] !== "boolean" && v["externo"] !== undefined) {
    return null;
  }
  if (!Number.isInteger(v["version"]) || (v["version"] as number) < 1) {
    return null;
  }
  return {
    registroId: v["registroId"],
    invitadoReunionId: invitado,
    externo: v["externo"] === true,
    version: v["version"] as number,
  };
}

/** Concilia un registro de asistencia de Zoom. Solo administración y el docente titular de la serie. */
export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const cuerpo = leerCuerpo(await request.json().catch(() => null));
  if (!cuerpo) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    const { instanciaId } = await context.params;
    const resultado = await conciliarAsistenciaZoom(
      { id: actor.id, rol: actor.rol },
      { ...cuerpo, instanciaId },
    );
    switch (resultado.tipo) {
      case "OK":
        return NextResponse.json(
          { version: resultado.version },
          { status: 200, headers: SIN_CACHE },
        );
      case "PROHIBIDO":
        return NextResponse.json(
          { error: "No tenés permisos para conciliar esta asistencia." },
          { status: 403 },
        );
      case "CONFLICTO":
        return NextResponse.json(
          { error: "Otra persona modificó este registro. Recargá e intentá de nuevo." },
          { status: 409 },
        );
      case "ERROR":
        return NextResponse.json(
          { error: "No se pudo conciliar la asistencia.", codigo: resultado.codigo },
          { status: resultado.codigo === "NO_ENCONTRADO" ? 404 : 422 },
        );
    }
  } catch {
    // Sin detalle: el mensaje de una excepción podría arrastrar datos internos.
    return NextResponse.json({ error: "No se pudo conciliar la asistencia." }, { status: 500 });
  }
}
