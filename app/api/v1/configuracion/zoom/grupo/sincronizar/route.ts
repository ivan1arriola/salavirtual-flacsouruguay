import { NextResponse } from "next/server";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { sincronizarCuentasZoomConGrupo } from "@/src/modules/configuracion/api";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const ERROR_SINCRONIZAR = "No se pudo sincronizar con el grupo de Zoom. Probá de nuevo más tarde.";

/**
 * Sincronización periódica de las cuentas Zoom con el grupo elegido (tarea programada). Nunca
 * confirma: una sincronización masiva se rechaza (502) hasta que alguien la confirme desde
 * Configuración › Salas.
 */
export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== "Bearer " + secret) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { ok, resumen } = await sincronizarCuentasZoomConGrupo(db, descifrarConfiguracion, new Date(), {
      actorId: null,
      confirmar: false
    });
    return NextResponse.json({ resumen }, { status: ok ? 200 : 502 });
  } catch (error) {
    console.error("[zoom] Falló la sincronización periódica de las cuentas Zoom", error);
    return NextResponse.json({ resumen: ERROR_SINCRONIZAR }, { status: 502 });
  }
}
