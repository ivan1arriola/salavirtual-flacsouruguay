import { NextResponse } from "next/server";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  eliminarEventoCalendarioAsistente,
  publicarEventoCalendarioAsistente,
} from "@/src/modules/asistencia/calendario-asistente-google.adapter";
import {
  hayErroresSincronizacionCalendarioAsistente,
  reconciliarCalendariosAsistentes,
} from "@/src/modules/asistencia/calendario-asistente.service";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret || request.headers.get("authorization") !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const results = await reconciliarCalendariosAsistentes({
    db,
    descifrar: descifrarConfiguracion,
    publicarEvento: publicarEventoCalendarioAsistente,
    eliminarEvento: eliminarEventoCalendarioAsistente,
  });
  const errores = results.filter(({ estado }) => estado === "ERROR");

  return NextResponse.json({
    procesadas: results.length,
    sincronizadas: results.length - errores.length,
    errores: errores.length,
    results,
  }, { status: hayErroresSincronizacionCalendarioAsistente(results) ? 502 : 200 });
}
