import { auth } from "@/auth";
import { crearProveedorTokenZoom } from "@/src/integrations/zoom/zoom-client";
import {
  consultarGrabacionOcurrenciaZoom,
  obtenerDetalleReunionPasadaZoom
} from "@/src/integrations/zoom/zoom-operations.client";
import { descargarAsistenciaOriginalZoom } from "@/src/integrations/zoom/zoom-reports.client";
import type { AutenticacionZoom } from "@/src/integrations/zoom/zoom-http";
import { resolveSessionActor } from "@/src/lib/auth/session-actor.adapter";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { obtenerCredencialesZoom } from "@/src/modules/configuracion/zoom-config.service";
import { puedeGestionarPrograma } from "@/src/modules/reuniones/permisos-programa.service";

export const runtime = "nodejs";
export const maxDuration = 60;

type Context = Readonly<{ params: Promise<{ instanciaId: string; ocurrenciaId: string }> }>;

const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };

function error(mensaje: string, status: number) {
  return Response.json({ error: mensaje }, { status, headers });
}

async function detalleZoom(autenticacion: AutenticacionZoom, uuid: string) {
  const [detalle, grabacion] = await Promise.all([
    obtenerDetalleReunionPasadaZoom(autenticacion, uuid).catch(() => null),
    consultarGrabacionOcurrenciaZoom(autenticacion, uuid).catch(() => "SIN_CONFIRMAR" as const)
  ]);
  const inicio = detalle?.inicio ?? null;
  const fin = detalle?.fin ?? null;
  const duracionSegundos =
    inicio && fin && fin >= inicio ? Math.round((fin.getTime() - inicio.getTime()) / 1000) : null;
  const huboTiempoDeProceso = fin && Date.now() - fin.getTime() >= 24 * 60 * 60 * 1000;
  const estadoGrabacion = grabacion === "SIN_ARCHIVOS" && !huboTiempoDeProceso ? "SIN_CONFIRMAR" : grabacion;
  return Response.json({ inicio, fin, duracionSegundos, estadoGrabacion }, { headers });
}

export async function GET(request: Request, { params }: Context) {
  const session = await auth();
  if (!session?.user) {
    return error("Sin sesión.", 401);
  }
  const actor = await resolveSessionActor(db, { id: session.user.id, email: session.user.email });
  if (!actor?.activo) {
    return error("Acceso denegado.", 403);
  }

  const { instanciaId, ocurrenciaId } = await params;
  const ocurrencia = await db.ocurrenciaArchivoZoom.findFirst({
    where: {
      id: ocurrenciaId,
      eventoProveedor: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } }
    },
    select: {
      uuid: true,
      eventoProveedor: {
        select: {
          instancia: {
            select: {
              solicitud: { select: { docentePrograma: { select: { programaId: true } } } },
              asignaciones: {
                where: {
                  estado: { in: ["ASIGNADO", "ACEPTADO"] },
                  asistenteTecnico: { usuarioId: actor.id }
                },
                take: 1,
                select: { id: true }
              }
            }
          }
        }
      }
    }
  });
  const instancia = ocurrencia?.eventoProveedor?.instancia;
  if (!ocurrencia || !instancia) {
    return error("Encuentro no encontrado.", 404);
  }
  const autorizado =
    actor.rol === "ASISTENTE_TECNICO"
      ? instancia.asignaciones.length > 0
      : await puedeGestionarPrograma(db, actor, instancia.solicitud.docentePrograma.programaId);
  if (!autorizado) {
    return error("Encuentro no encontrado.", 404);
  }

  try {
    const credenciales = await obtenerCredencialesZoom(db, descifrarConfiguracion);
    if (!credenciales.disponible) {
      return error("Zoom no está configurado.", 503);
    }
    const autenticacion = crearProveedorTokenZoom(credenciales);
    if (new URL(request.url).searchParams.get("detalle") === "1") {
      return await detalleZoom(autenticacion, ocurrencia.uuid);
    }

    const original = await descargarAsistenciaOriginalZoom(await autenticacion.obtener(), ocurrencia.uuid);
    if (original === null) {
      return error("Zoom todavía no entregó el reporte original de esta ejecución.", 404);
    }
    const idSeguro = ocurrenciaId.replace(/[^a-zA-Z0-9_-]/g, "");
    return new Response(original, {
      headers: {
        ...headers,
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="asistencia-zoom-${idSeguro}.json"`
      }
    });
  } catch {
    return error("No se pudo consultar Zoom. Intentá nuevamente.", 502);
  }
}
