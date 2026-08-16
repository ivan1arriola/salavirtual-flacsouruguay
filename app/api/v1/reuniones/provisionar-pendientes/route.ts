import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { sincronizarEventosPendientes } from "@/src/modules/meet/provisionar-eventos.service";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id,
      email: session.user.email,
    });
    if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const events = await db.eventoProveedor.findMany({
      where: {
        proveedor: { tipo: "GOOGLE_MEET" },
        operacionPendiente: { not: null },
      },
      select: { id: true },
    });
    const results = await sincronizarEventosPendientes(
      { db, descifrar: descifrarConfiguracion, crearProvider: crearGoogleCalendarProvider },
      events.map(({ id }) => id),
    );
    return NextResponse.json({
      procesadas: results.length,
      sincronizadas: results.filter(({ estado }) => estado === "SINCRONIZADA").length,
      enProceso: results.filter(({ estado }) => estado === "EN_PROCESO").length,
      pendientesConfiguracion: results.filter(({ estado }) => estado === "PENDIENTE_CONFIGURACION").length,
      requierenRevision: results.filter(({ estado }) => estado === "REQUIERE_REVISION").length,
      errores: results.filter(({ estado }) => estado === "ERROR").length,
    });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
