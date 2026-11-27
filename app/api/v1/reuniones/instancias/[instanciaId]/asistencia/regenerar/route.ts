import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { db } from "@/src/lib/db";
import { sincronizarArtefactos } from "@/src/bootstrap/archivos.server";
import { regenerarAsistenciaInstanciaZoom } from "@/src/bootstrap/zoom-asistencia.server";
import { toHttpError } from "@/src/lib/http/api-error";
export const runtime = "nodejs";
type RouteContext = Readonly<{ params: Promise<{ instanciaId: string }> }>;
export async function POST(_request: Request, context: RouteContext) {
  const session = await auth();
  if (!session?.user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo || actor.rol !== "ADMINISTRACION") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const { instanciaId } = await context.params;
    // Una serie migrada a Zoom conserva su evento de Meet: manda el proveedor activo, no la mera existencia del evento.
    const instancia = await db.instanciaSala.findUnique({
      where: { id: instanciaId },
      select: { proveedorActivoTipo: true },
    });
    const event =
      instancia?.proveedorActivoTipo === "ZOOM"
        ? null
        : await db.eventoProveedor.findFirst({
            where: { instanciaSalaId: instanciaId, proveedor: { tipo: "GOOGLE_MEET" } },
            select: { id: true },
          });
    if (!event) {
      // Encuentro Zoom: la asistencia sale de la base y la planilla de Drive es un paso independiente (ver detalle por ocurrencia).
      const zoom = await db.eventoProveedor.findFirst({
        where: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } },
        select: { id: true },
      });
      if (!zoom) {
        return NextResponse.json(
          { error: "No se encontró un encuentro Meet ni Zoom para esta instancia." },
          { status: 404 },
        );
      }
      const resumen = await regenerarAsistenciaInstanciaZoom(instanciaId);
      return NextResponse.json(
        {
          proveedor: "ZOOM",
          ocurrencias: resumen.ocurrencias,
          resultados: resumen.resultados.map((r) => ({
            sincronizacion: r.sincronizacion.tipo,
            planilla: r.planilla.tipo,
            ...(r.sincronizacion.tipo === "ERROR"
              ? { codigoSincronizacion: r.sincronizacion.codigo }
              : {}),
            ...(r.planilla.tipo === "ERROR" ? { codigoPlanilla: r.planilla.codigo } : {}),
          })),
        },
        { headers: { "Cache-Control": "private, no-store, max-age=0" } },
      );
    }
    const [result] = await sincronizarArtefactos([event.id], true);
    if (!result || result.estado === "ERROR") {
      return NextResponse.json(
        {
          error: "No se pudo regenerar la planilla de asistencia.",
          detalle: result?.error ?? "La sincronización no devolvió un motivo del error.",
        },
        { status: 502 },
      );
    }
    return NextResponse.json(
      { estado: result.estado },
      { headers: { "Cache-Control": "private, no-store, max-age=0" } },
    );
  } catch (error) {
    const mapped = toHttpError(error);
    return NextResponse.json({ error: mapped.message }, { status: mapped.status });
  }
}
