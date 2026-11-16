import { NextResponse } from "next/server";
import { reconciliarCalendariosZoom } from "@/src/bootstrap/calendario-zoom-asistente.server";
import { db } from "@/src/lib/db";
import { obtenerServicioConferencias } from "@/src/bootstrap/conferencias.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const pendientes = await db.eventoProveedor.findMany({
    where: {
      operacionPendiente: { not: null },
      AND: [
        {
          OR: [
            { proveedor: { tipo: "ZOOM" } },
            {
              proveedor: { tipo: "GOOGLE_MEET" },
              externalEventId: { not: null },
              instancia: { proveedorActivoTipo: "GOOGLE_MEET", conservarGoogleMeet: true }
            }
          ]
        },
        {
          OR: [
            { reclamoIntegracionAt: null },
            { reclamoIntegracionAt: { lt: new Date(Date.now() - 10 * 60_000) } }
          ]
        }
      ]
    },
    orderBy: { updatedAt: "asc" },
    take: 10,
    select: { id: true }
  });
  const [resultados, erroresCalendariosZoom] = await Promise.all([
    obtenerServicioConferencias().sincronizarEventosPendientes(pendientes.map(({ id }) => id)),
    reconciliarCalendariosZoom().catch(() => {
      console.warn("[Calendar] Falló la reconciliación de calendarios de coberturas Zoom.");
      return null;
    })
  ]);
  const errores = resultados.filter((result) => result.estado === "ERROR");
  return NextResponse.json(
    {
      procesados: resultados.length,
      sincronizados: resultados.filter((result) => result.estado === "SINCRONIZADA").length,
      pendientes: resultados.filter((result) => result.estado !== "SINCRONIZADA").length,
      errores: errores.length,
      erroresCalendariosZoom
    },
    { status: errores.length ? 502 : 200 }
  );
}
