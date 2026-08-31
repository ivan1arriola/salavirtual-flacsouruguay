import { NextResponse } from "next/server";
import { db } from "@/src/lib/db";
import { enviarReportesMensualesAsistencia } from "@/src/modules/asistencia/reporte-mensual.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await enviarReportesMensualesAsistencia(db);
  const incompleto = resultado.errores > 0 || resultado.sinCorreo > 0;
  return NextResponse.json(resultado, { status: incompleto ? 500 : 200 });
}
