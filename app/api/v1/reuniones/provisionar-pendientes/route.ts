import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { crearGoogleCalendarProvider } from "@/src/modules/meet/google-calendar.adapter";
import { provisionarEventosMeet } from "@/src/modules/meet/provisionar-eventos.service";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const events = await db.eventoProveedor.findMany({
    where: {
      proveedor: { tipo: "GOOGLE_MEET" },
      estadoIntegracion: { in: ["PENDIENTE", "ERROR"] },
      instancia: {
        inicioProgramadoAt: { gte: new Date() },
        estado: "PROGRAMADA"
      }
    },
    select: { id: true }
  });
  const results = await provisionarEventosMeet(
    {
      db,
      descifrar: descifrarConfiguracion,
      crearProvider: crearGoogleCalendarProvider
    },
    events.map(({ id }) => id)
  );
  return NextResponse.json({
    procesadas: results.length,
    sincronizadas: results.filter(({ estado }) => estado === "SINCRONIZADA").length,
    pendientes: results.filter(({ estado }) => estado === "PENDIENTE_CONFIGURACION").length,
    errores: results.filter(({ estado }) => estado === "ERROR").length
  });
}
