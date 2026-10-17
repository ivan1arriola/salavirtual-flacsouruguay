import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { obtenerCredencialAdminReportsGoogle } from "@/src/modules/configuracion/api";
import { obtenerCorreosAuditoriaMeet } from "@/src/modules/archivos/infrastructure/google/google-meet-audit-emails.client";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
type Context = { params: Promise<{ instanciaId: string }> };

export async function GET(_request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Sin sesión" }, { status: 401 });
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Acceso reservado a Administración" }, { status: 403 });
  }
  const { instanciaId } = await params;
  const evento = await db.eventoProveedor.findFirst({
    where: { instanciaSalaId: instanciaId, proveedor: { tipo: "GOOGLE_MEET" } },
    select: {
      codigoReunion: true,
      instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true, estado: true } }
    }
  });
  if (!evento?.codigoReunion) return NextResponse.json({ error: "Sin Meet asociado" }, { status: 404 });
  if (evento.instancia.finProgramadoAt > new Date() || evento.instancia.estado === "CANCELADA") {
    return NextResponse.json({ error: "La reunión no ha finalizado" }, { status: 409 });
  }
  const adminCred = await obtenerCredencialAdminReportsGoogle(db, descifrarConfiguracion);
  if (!adminCred) {
    return NextResponse.json({ error: "Configuración de Reports API incompleta" }, { status: 503 });
  }
  try {
    const correos = await obtenerCorreosAuditoriaMeet({
      serviceAccountEmail: adminCred.serviceAccountEmail,
      privateKey: adminCred.privateKey,
      adminEmail: adminCred.adminEmail,
      meetingCode: evento.codigoReunion,
      startTime: new Date(evento.instancia.inicioProgramadoAt.getTime() - 30 * 60000).toISOString(),
      endTime: new Date(evento.instancia.finProgramadoAt.getTime() + 30 * 60000).toISOString()
    });
    return NextResponse.json({ correos, total: correos.length, codigo: evento.codigoReunion }, {
      headers: { "Cache-Control": "no-store" }
    });
  } catch (error) {
    console.error("Meet audit query failed", error instanceof Error ? error.message : String(error));
    return NextResponse.json({ error: "Error al consultar la auditoría de Google Workspace" }, { status: 502 });
  }
}
