import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { sincronizarAsignacionAsistente } from "@/src/bootstrap/asistencia.server";
import { gestionarCoberturaMonitoreo } from "@/src/modules/asistencia/gestion-cobertura.service";

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const result = await gestionarCoberturaMonitoreo(
      db,
      actor,
      await request.json().catch(() => null),
    );
    if (result.accion === "CONVOCAR" || result.accion === "ASIGNAR_DIRECTO") {
      // Se ejecuta después del commit. Nunca se invoca para encuentros pasados.
      const sync = await sincronizarAsignacionAsistente(
        result.instanciaSalaId,
        "El monitoreo se guardó, pero el calendario del asistente está pendiente.",
      );
      const warnings = ["warning" in result ? result.warning : null, sync.warning].filter(Boolean);
      return NextResponse.json(
        {
          ...result,
          ...sync,
          warning: warnings.join(" ") || null,
        },
        { status: warnings.length ? 202 : 200 },
      );
    }
    return NextResponse.json(result, {
      status: result.accion === "REGISTRAR_RETROACTIVO" ? 201 : 200,
    });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
