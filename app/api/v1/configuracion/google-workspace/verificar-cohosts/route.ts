import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { cargarCredencialesLegacyGoogleWorkspace } from "@/src/modules/configuracion/google-workspace.service";
import { verificarCohostsGlobalPagina } from "@/src/modules/configuracion/verificar-cohosts-global.service";
import { crearGoogleMeetAuthClient } from "@/src/integrations/google/auth";
import { listarMiembrosMeetHttp, obtenerEspacioMeet } from "@/src/integrations/google/meet";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
  if (cursor && !/^[a-zA-Z0-9_:-]{1,160}$/.test(cursor)) {
    return NextResponse.json({ error: "Cursor de paginación inválido." }, { status: 400 });
  }

  try {
    const result = await verificarCohostsGlobalPagina({
      db,
      descifrar: descifrarConfiguracion,
      listarLegacy: () => cargarCredencialesLegacyGoogleWorkspace(db, descifrarConfiguracion),
      leerMiembros: async (credential, organizador, codigoReunion) => {
        const auth = crearGoogleMeetAuthClient({ ...credential, subject: organizador });
        const space = await obtenerEspacioMeet(auth, codigoReunion);
        if (!space.name) throw new Error("Google Meet no devolvió el ID del espacio.");
        return listarMiembrosMeetHttp(auth, space.name);
      },
    }, cursor);
    return NextResponse.json(result, { headers: { "Cache-Control": "no-store" } });
  } catch {
    // Never include provider payloads, service-account keys or tokens.
    return NextResponse.json({
      error: "No se pudo completar la verificación. Revisá la configuración de Google Workspace.",
    }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
