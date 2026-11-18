import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { ejecutarAccionAgendaZoom } from "@/src/bootstrap/zoom-agenda-acciones.server";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120;

const NO_CACHE = { "Cache-Control": "private, no-store" };

const accionSchema = z.discriminatedUnion("accion", [
  z.object({
    accion: z.enum(["CORREGIR_EN_ZOOM", "ADOPTAR_DE_ZOOM", "RECREAR_EN_ZOOM", "CANCELAR_ENCUENTRO"]),
    instanciaId: z.string().min(1).max(100)
  }),
  z.object({ accion: z.enum(["IGNORAR", "DEJAR_DE_IGNORAR"]), observadaId: z.string().min(1).max(100) })
]);

/** Acciones manuales sobre las diferencias de la agenda de Zoom (solo administración). */
export async function POST(request: Request) {
  const session = await auth();
  const actor = session?.user
    ? await resolveSessionActor(db, { id: session.user.id, email: session.user.email })
    : null;
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "No autorizado" }, { status: 403, headers: NO_CACHE });
  }
  const entrada = accionSchema.safeParse(await request.json().catch(() => null));
  if (!entrada.success) {
    return NextResponse.json({ error: "Acción inválida." }, { status: 400, headers: NO_CACHE });
  }
  try {
    const { eventoProveedorIds } = await ejecutarAccionAgendaZoom(actor, entrada.data);
    // Fuera de transacción: el cambio local ya quedó guardado; si la sincronización queda pendiente, se avisa.
    const sincronizacion = eventoProveedorIds.length
      ? await obtenerServicioConferencias()
          .sincronizarEventosPendientes(eventoProveedorIds)
          .catch(() => null)
      : [];
    const pendiente =
      sincronizacion === null || sincronizacion.some(({ estado }) => estado !== "SINCRONIZADA");
    return NextResponse.json(
      {
        message: pendiente
          ? "El cambio quedó guardado en Sala Virtual, pero la sincronización con Zoom tiene pendientes."
          : "Listo.",
        pendiente
      },
      { status: pendiente ? 202 : 200, headers: NO_CACHE }
    );
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status, headers: NO_CACHE });
  }
}
