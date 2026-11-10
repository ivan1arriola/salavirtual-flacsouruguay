import "server-only";
import { db } from "../lib/db";
import { puedeConciliarAsistenciaZoom, type ActorConciliacionZoom } from "../modules/archivos/domain";

export type RegistroAsistenciaZoomFicha = Readonly<{
  id: string;
  version: number;
  nombre: string;
  emailObservado: string | null;
  minutos: number;
  porcentaje: number;
  sesiones: number;
  esHostOCohost: boolean;
  estadoConciliacion: "SIN_CONCILIAR" | "SUGERIDO" | "CONCILIADO" | "EXTERNO";
  invitadoReunionId: string | null;
}>;

export type AsistenciaZoomFicha = Readonly<{
  /** Estado del reporte de Zoom (no de ninguna planilla). */
  estadoReporte: "SIN_OCURRENCIAS" | "PENDIENTE" | "NO_DISPONIBLE" | "VACIO" | "DISPONIBLE" | "ERROR";
  registros: readonly RegistroAsistenciaZoomFicha[];
  invitados: ReadonlyArray<Readonly<{ id: string; email: string; nombre: string | null }>>;
  puedeConciliar: boolean;
}>;

const PRIORIDAD = ["ERROR", "PENDIENTE", "NO_DISPONIBLE", "VACIO", "DISPONIBLE"] as const;

/**
 * Lee lo ya persistido para la ficha. Solo lectura: renderizar la página nunca llama a Zoom,
 * no ejecuta backfill ni escribe asistencia.
 */
export async function leerAsistenciaZoomFicha(instanciaId: string, actor: ActorConciliacionZoom): Promise<AsistenciaZoomFicha> {
  const evento = await db.eventoProveedor.findFirst({
    where: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } },
    select: {
      id: true,
      instancia: { select: { solicitud: { select: { docentePrograma: { select: { docente: { select: { usuarioId: true } } } } } } } },
      ocurrenciasArchivoZoom: { select: { estadoAsistencia: true } }
    }
  });
  if (!evento) return { estadoReporte: "SIN_OCURRENCIAS", registros: [], invitados: [], puedeConciliar: false };

  const [registros, invitados] = await Promise.all([
    db.registroAsistenciaZoom.findMany({
      where: { eventoProveedorId: evento.id }, orderBy: [{ primeraEntradaAt: "asc" }, { nombre: "asc" }]
    }),
    db.invitadoReunion.findMany({ where: { instanciaSalaId: instanciaId }, orderBy: { email: "asc" }, select: { id: true, email: true, nombre: true } })
  ]);
  const estados = evento.ocurrenciasArchivoZoom.map((o) => o.estadoAsistencia);
  const estadoReporte = estados.length === 0
    ? "SIN_OCURRENCIAS" as const
    : PRIORIDAD.find((p) => estados.includes(p)) ?? "PENDIENTE" as const;

  return {
    estadoReporte,
    registros: registros.map((r) => ({
      id: r.id, version: r.version, nombre: r.nombre, emailObservado: r.emailObservado, minutos: Number(r.minutos),
      porcentaje: Number(r.porcentaje), sesiones: r.sesiones, esHostOCohost: r.esHostOCohost,
      estadoConciliacion: r.estadoConciliacion, invitadoReunionId: r.invitadoReunionId
    })),
    invitados,
    puedeConciliar: puedeConciliarAsistenciaZoom(actor, { titularUsuarioId: evento.instancia.solicitud.docentePrograma.docente.usuarioId })
  };
}
