import { NextResponse } from "next/server";
import { z } from "zod";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { toHttpError } from "@/src/lib/http/api-error";
import { cancelarSolicitudesAtomicas } from "@/src/modules/reuniones/cancelar-solicitudes-atomicas.service";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";

export const runtime = "nodejs";

const schema = z.object({
  solicitudIds: z.array(z.string().min(1).max(128)).min(1).max(50)
});

export async function POST(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, {
      id: session.user.id, email: session.user.email
    });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const input = schema.parse(await request.json().catch(() => null));
    const result = await cancelarSolicitudesAtomicas(db, actor, input.solicitudIds);

    // A successful transaction persists each event's pending CANCELAR operation.
    // The background reconciliation endpoint performs Google HTTP calls later.
    return NextResponse.json({
      message: "La cancelación quedó registrada. Google Calendar se actualizará en segundo plano.",
      solicitudesCanceladas: result.solicitudesCanceladas,
      eventosGooglePendientes: result.eventoProveedorIds.length
    }, { status: 202 });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}

/** Returns persisted cancellation progress without querying Google synchronously. */
export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    const ids = schema.parse({
      solicitudIds: new URL(request.url).searchParams.getAll("solicitudId")
    }).solicitudIds;
    const uniqueIds = [...new Set(ids)];
    const requests = await db.solicitudSala.findMany({
      where: { id: { in: uniqueIds } },
      select: {
        id: true,
        estado: true,
        docentePrograma: { select: { programaId: true } },
        instancias: {
          select: {
            eventosProveedor: {
              where: { proveedor: { tipo: "GOOGLE_MEET" } },
              select: { estadoIntegracion: true, operacionPendiente: true }
            }
          }
        }
      }
    });
    if (requests.length !== uniqueIds.length) {
      return NextResponse.json({ error: "Una solicitud de la serie no existe." }, { status: 404 });
    }
    for (const requestItem of requests) {
      if (!await puedeGestionarPrograma(db, actor, requestItem.docentePrograma.programaId)) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const solicitudes = requests.map((item) => {
      const eventos = item.instancias.flatMap((instance) => instance.eventosProveedor);
      return {
        id: item.id,
        estado: item.estado,
        googlePendientes: eventos.filter((event) => event.operacionPendiente === "CANCELAR").length,
        googleErrores: eventos.filter((event) =>
          event.operacionPendiente === "CANCELAR" && event.estadoIntegracion === "ERROR"
        ).length
      };
    });
    return NextResponse.json({
      solicitudes,
      confirmada: solicitudes.every((item) => item.estado === "CANCELADA" && item.googlePendientes === 0)
    }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
