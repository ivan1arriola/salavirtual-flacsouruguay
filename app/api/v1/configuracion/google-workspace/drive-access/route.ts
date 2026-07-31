import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { mensajeErrorGoogleWorkspace } from "@/src/modules/configuracion/google-workspace.domain";
import { prepararAccesoSalasDrive } from "@/src/modules/configuracion/google-workspace-test.adapter";

export const runtime = "nodejs";

export async function POST() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
    if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const [configuration, hosts] = await Promise.all([
      db.configuracionGoogleWorkspace.findUnique({ where: { id: "principal", activa: true } }),
      db.cuentaProveedor.findMany({
        where: { proveedor: { tipo: "GOOGLE_MEET" }, activa: true, emailOrganizador: { not: null } },
        select: { emailOrganizador: true },
        orderBy: { prioridad: "asc" }
      })
    ]);
    if (!configuration?.serviceAccountEmail || !configuration.privateKeyCifrada ||
      !configuration.serviceAccountSubject || !configuration.driveDestinationId) {
      throw new Error("La configuración de Google Workspace está incompleta.");
    }
    const message = await prepararAccesoSalasDrive({
      serviceAccountEmail: configuration.serviceAccountEmail,
      privateKey: descifrarConfiguracion(configuration.privateKeyCifrada),
      subject: configuration.serviceAccountSubject
    }, configuration.driveDestinationId, hosts.flatMap(({ emailOrganizador }) =>
      emailOrganizador ? [emailOrganizador] : []
    ));
    return NextResponse.json({ message });
  } catch (error) {
    return NextResponse.json({ error: mensajeErrorGoogleWorkspace(error) }, { status: 400 });
  }
}
