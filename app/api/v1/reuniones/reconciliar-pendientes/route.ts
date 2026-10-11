import { NextResponse } from "next/server";
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
      proveedor: { tipo: "GOOGLE_MEET" },
      operacionPendiente: { not: null },
      OR: [
        { reclamoIntegracionAt: null },
        { reclamoIntegracionAt: { lt: new Date(Date.now() - 10 * 60_000) } }
      ]
    },
    orderBy: { updatedAt: "asc" },
    take: 10,
    select: { id: true }
  });
  const resultados = await obtenerServicioConferencias().sincronizarEventosPendientes(
    pendientes.map(({ id }) => id)
  );
  const errores = resultados.filter((result) => result.estado === "ERROR");
  return NextResponse.json({
    procesados: resultados.length,
    sincronizados: resultados.filter((result) => result.estado === "SINCRONIZADA").length,
    pendientes: resultados.filter((result) => result.estado !== "SINCRONIZADA").length,
    errores: errores.length
  }, { status: errores.length ? 502 : 200 });
}
