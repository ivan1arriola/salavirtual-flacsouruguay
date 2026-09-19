import { NextResponse } from "next/server";
import { enviarReportesMensuales } from "@/src/bootstrap/liquidaciones.server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const resultado = await enviarReportesMensuales();
  const incompleto = resultado.errores > 0 || resultado.sinCorreo > 0;
  return NextResponse.json(resultado, { status: incompleto ? 500 : 200 });
}
