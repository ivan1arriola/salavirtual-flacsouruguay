import type { PrismaClient } from "@prisma/client";
import type { SessionActor } from "@/src/lib/auth/session-actor.adapter";
import { ConflictApiError, ForbiddenApiError, NotFoundApiError } from "@/src/lib/http/api-error";
import { puedeVerEnlaceAnfitrion } from "./enlace-anfitrion.domain";
import { seleccionarEventoProveedorActivo } from "./evento-proveedor-activo.domain";
import { puedeGestionarPrograma } from "./permisos-programa.service";

export type IniciarReunionZoomDependencias = Readonly<{
  db: PrismaClient;
  /** Pide a Zoom un `start_url` vigente: el token ZAK que lleva vence en pocas horas. */
  obtenerStartUrl: (zoomMeetingId: string) => Promise<string | null>;
}>;

/**
 * Devuelve el enlace para iniciar la reunión como anfitrión.
 * Nunca se persiste ni se envía al navegador dentro de una página: solo se entrega como redirección.
 */
export async function obtenerEnlaceInicioZoom(
  dependencias: IniciarReunionZoomDependencias,
  actor: SessionActor,
  instanciaId: string
): Promise<string> {
  const instancia = await dependencias.db.instanciaSala.findUnique({
    where: { id: instanciaId },
    select: {
      estado: true,
      finProgramadoAt: true,
      proveedorActivoTipo: true,
      eventosProveedor: {
        select: {
          externalEventId: true,
          reunionProveedorId: true,
          reunionProveedor: { select: { externalId: true } },
          proveedor: { select: { tipo: true } }
        }
      },
      solicitud: {
        select: {
          docentePrograma: { select: { programaId: true, docente: { select: { usuarioId: true } } } }
        }
      }
    }
  });
  if (!instancia) {
    throw new NotFoundApiError("El encuentro no existe.");
  }

  const { programaId, docente } = instancia.solicitud.docentePrograma;
  if (
    !(await puedeGestionarPrograma(dependencias.db, actor, programaId)) ||
    !puedeVerEnlaceAnfitrion(actor, docente.usuarioId)
  ) {
    throw new ForbiddenApiError("No tenés permisos para iniciar esta reunión.");
  }
  if (instancia.estado !== "PROGRAMADA" || instancia.finProgramadoAt <= new Date()) {
    throw new ConflictApiError("El encuentro no está disponible para iniciarse.");
  }

  const evento = seleccionarEventoProveedorActivo(instancia);
  // En una serie con reunión compartida el ID de la reunión es el de la serie, no el del encuentro.
  const zoomMeetingId = evento?.reunionProveedorId
    ? evento.reunionProveedor?.externalId
    : evento?.externalEventId;
  if (evento?.proveedor.tipo !== "ZOOM" || !zoomMeetingId) {
    throw new ConflictApiError("El encuentro no tiene una reunión de Zoom activa.");
  }

  const startUrl = await dependencias.obtenerStartUrl(zoomMeetingId);
  if (!startUrl) {
    throw new ConflictApiError("Zoom no devolvió el enlace de inicio de la reunión.");
  }
  return startUrl;
}
