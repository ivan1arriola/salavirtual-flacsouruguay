import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { buscarGrabacionVisible } from "@/src/modules/meet/grabaciones.adapter";
import { transmitirArchivoDrive } from "@/src/modules/meet/google-drive-media.adapter";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(
  request: Request,
  context: Readonly<{ params: Promise<{ archivoId: string }> }>
) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { archivoId } = await context.params;
  const recording = await buscarGrabacionVisible(db, actor, archivoId);
  if (!recording) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const configuration = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal", activa: true }
  });
  const subject = recording.eventoProveedor.cuentaProveedor?.emailOrganizador;
  if (!configuration?.serviceAccountEmail || !configuration.privateKeyCifrada || !subject) {
    return NextResponse.json({ error: "La reproducción no está configurada." }, { status: 503 });
  }

  try {
    return await transmitirArchivoDrive({
      serviceAccountEmail: configuration.serviceAccountEmail,
      privateKey: descifrarConfiguracion(configuration.privateKeyCifrada),
      subject
    }, recording.driveFileId, request.headers.get("range"));
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "No se pudo reproducir la grabación."
    }, { status: 502 });
  }
}
