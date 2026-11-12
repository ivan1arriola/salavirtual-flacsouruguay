import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { resincronizarCohostsReunionesExistentes } from "@/src/modules/configuracion/resincronizar-cohosts.service";
import { crearGoogleConferenceProvider } from "@/src/modules/conferencias/api";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor || actor.rol !== "ADMINISTRACION" || !actor.activo) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const result = await resincronizarCohostsReunionesExistentes({
    db,
    descifrar: descifrarConfiguracion,
    crearProvider: crearGoogleConferenceProvider
  });

  await db.auditoria.create({
    data: {
      actorUsuarioId: actor.id,
      accion: "COHOSTS_REUNIONES_RESINCRONIZADOS",
      entidadTipo: "ConfiguracionGoogleWorkspace",
      entidadId: "principal",
      valorNuevo: {
        reunionesActivas: result.reunionesActivas,
        candidatas: result.candidatas,
        cohostsAgregados: result.cohostsAgregados,
        sincronizadas: result.sincronizadas,
        omitidas: result.omitidas,
        fallidas: result.fallidas
      }
    }
  });

  return NextResponse.json({
    ...result,
    errores: result.errores.slice(0, 20)
  });
}
