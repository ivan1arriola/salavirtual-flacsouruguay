import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { vincularOcurrenciaZoomAdmin } from "@/src/bootstrap/zoom-historico.server";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";

export const runtime = "nodejs";
type RouteContext = Readonly<{ params: Promise<{ ocurrenciaId: string }> }>;

/** Vincula una ocurrencia conservada con un encuentro Zoom, sin volver a transferir. Solo administración. */
export async function POST(request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (actor.rol !== "ADMINISTRACION") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const cuerpo = (await request.json().catch(() => null)) as { eventoId?: unknown } | null;
  const eventoId = cuerpo?.eventoId;
  if (typeof eventoId !== "string" || eventoId.length === 0 || eventoId.length > 64) {
    return NextResponse.json({ error: "Petición inválida." }, { status: 400 });
  }

  try {
    const { ocurrenciaId } = await context.params;
    const r = await vincularOcurrenciaZoomAdmin({ id: actor.id, rol: actor.rol }, ocurrenciaId, eventoId);
    switch (r.tipo) {
      case "VINCULADA":
        return NextResponse.json({
          referenciasCreadas: r.referenciasCreadas,
          // El worker mueve la carpeta (conservando los IDs) en su próximo ciclo; hasta entonces no hereda el acceso del encuentro.
          advertencia: "El vínculo se registró. La carpeta de Drive se moverá a las grabaciones vinculadas en el próximo ciclo del worker (unos minutos); hasta entonces los archivos no heredan el acceso del encuentro."
        }, { status: 200 });
      case "YA_VINCULADA": return NextResponse.json({ yaVinculada: true }, { status: 200 });
      case "VINCULADA_A_OTRO": return NextResponse.json({ error: "La ocurrencia ya está vinculada a otro encuentro." }, { status: 409 });
      case "CONFLICTO_DRIVE": return NextResponse.json({ error: "Un archivo ya está referenciado por otra grabación." }, { status: 409 });
      case "EVENTO_NO_ZOOM": return NextResponse.json({ error: "El encuentro no es de Zoom." }, { status: 422 });
      case "NO_ENCONTRADA": return NextResponse.json({ error: "No encontrada.", recurso: r.recurso }, { status: 404 });
      case "PROHIBIDO": return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } catch {
    return NextResponse.json({ error: "No se pudo vincular." }, { status: 500 });
  }
}
