import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/src/lib/db";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerZoomAccessToken } from "@/src/integrations/zoom/zoom-client";
import { descargarReporteParticipantesZoomOriginalHttp } from "@/src/integrations/zoom/zoom-reports.client";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type Context = Readonly<{ params: Promise<{ instanciaId: string; ocurrenciaId: string }> }>;
const NO_CACHE = {
  "Cache-Control": "private, no-store, max-age=0",
  "X-Content-Type-Options": "nosniff",
};

const errorJson = (mensaje: string, status: number) =>
  NextResponse.json({ error: mensaje }, { status, headers: NO_CACHE });

/** Reporte de participantes tal como lo entrega Zoom (sin transformar), consultado en el momento. */
export async function GET(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user) {
    return errorJson("Sin sesión", 401);
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    return errorJson("Acceso denegado", 403);
  }
  const { instanciaId, ocurrenciaId } = await params;
  const ocurrencia = await db.ocurrenciaArchivoZoom.findFirst({
    where: {
      id: ocurrenciaId,
      eventoProveedor: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } },
    },
    select: {
      uuid: true,
      inicioRealAt: true,
      eventoProveedor: {
        select: {
          instancia: {
            select: {
              solicitud: { select: { docentePrograma: { select: { programaId: true } } } },
            },
          },
        },
      },
    },
  });
  // Igual que las demás exportaciones: no revelar la existencia de reuniones ajenas.
  if (
    !ocurrencia?.eventoProveedor ||
    !(await puedeGestionarPrograma(
      db,
      actor,
      ocurrencia.eventoProveedor.instancia.solicitud.docentePrograma.programaId,
    ))
  ) {
    return errorJson("Ocurrencia no encontrada", 404);
  }
  try {
    const credenciales = await obtenerCredencialesZoom(db, descifrarConfiguracion);
    if (!credenciales.disponible) {
      return errorJson("Zoom no está configurado.", 503);
    }
    const paginas = await descargarReporteParticipantesZoomOriginalHttp(
      await obtenerZoomAccessToken(credenciales),
      ocurrencia.uuid,
    );
    if (!paginas) {
      return errorJson("Zoom todavía no tiene el reporte de participantes de esta reunión.", 404);
    }
    const fecha = ocurrencia.inicioRealAt.toISOString().slice(0, 10);
    // Una página por elemento, sin tocar el contenido que devolvió Zoom.
    return new Response(JSON.stringify(paginas, null, 2), {
      status: 200,
      headers: {
        ...NO_CACHE,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="zoom_participantes_original_${fecha}_${ocurrenciaId.replace(/[^a-zA-Z0-9_-]/g, "")}.json"`,
      },
    });
  } catch {
    return errorJson("No se pudieron recuperar los datos desde Zoom. Intentá nuevamente.", 502);
  }
}
