import "server-only";
import { db } from "../lib/db";
import {
  consolidarAsistenciaZoom,
  puedeConciliarAsistenciaZoom,
  type ActorConciliacionZoom,
  type SesionObservadaZoom
} from "../modules/archivos/domain";

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
  /** Cada conexión observada por Zoom (reingresos y varios dispositivos incluidos), con su correo si lo informó. */
  conexiones: ReadonlyArray<
    Readonly<{ entradaAt: string; salidaAt: string; email: string | null; status: string | null }>
  >;
}>;

export type AsistenciaZoomFicha = Readonly<{
  /** Estado del reporte de Zoom (no de ninguna planilla). */
  estadoReporte: "SIN_OCURRENCIAS" | "PENDIENTE" | "NO_DISPONIBLE" | "VACIO" | "DISPONIBLE" | "ERROR";
  registros: readonly RegistroAsistenciaZoomFicha[];
  ocurrencias: readonly OcurrenciaAsistenciaZoomFicha[];
  invitados: ReadonlyArray<Readonly<{ id: string; email: string; nombre: string | null }>>;
  puedeConciliar: boolean;
}>;

export type OcurrenciaAsistenciaZoomFicha = Readonly<{
  id: string;
  inicioRealAt: Date;
  estadoReporte: string;
  registros: ReadonlyArray<
    Readonly<{
      clave: string;
      nombre: string;
      email: string | null;
      minutos: number;
      conexiones: number;
      primeraEntradaAt: Date | null;
      ultimaSalidaAt: Date | null;
    }>
  >;
}>;

function asistenciaPorOcurrencia(ocurrencia: {
  id: string;
  inicioRealAt: Date;
  estadoAsistencia: string;
  sesionesAsistencia: Array<{
    claveSesion: string;
    participanteId: string | null;
    userId: string | null;
    nombre: string;
    email: string | null;
    entradaAt: Date;
    salidaAt: Date;
    status: string | null;
    rol: string | null;
  }>;
}): OcurrenciaAsistenciaZoomFicha {
  const sesiones: SesionObservadaZoom[] = ocurrencia.sesionesAsistencia.map((s) => ({
    ...s,
    status: s.status === "in_waiting_room" || s.status === "in_meeting" ? s.status : null,
    rol: s.rol === "HOST" || s.rol === "COHOST" ? s.rol : null
  }));
  const validas = sesiones.filter((s) => s.salidaAt.getTime() > s.entradaAt.getTime());
  const inicio = validas.length ? Math.min(...validas.map((s) => s.entradaAt.getTime())) : null;
  const fin = validas.length ? Math.max(...validas.map((s) => s.salidaAt.getTime())) : null;
  const registros =
    inicio !== null && fin !== null && fin > inicio
      ? consolidarAsistenciaZoom(sesiones, { inicioAt: new Date(inicio), finAt: new Date(fin) })
          .filter((r) => r.minutos > 0)
          .map((r) => ({
            clave: r.claveParticipante,
            nombre: r.nombre,
            email: r.emailObservado,
            minutos: r.minutos,
            conexiones: r.sesiones,
            primeraEntradaAt: r.primeraEntradaAt,
            ultimaSalidaAt: r.ultimaSalidaAt
          }))
      : [];
  return {
    id: ocurrencia.id,
    inicioRealAt: ocurrencia.inicioRealAt,
    estadoReporte: ocurrencia.estadoAsistencia,
    registros
  };
}

const PRIORIDAD = ["ERROR", "PENDIENTE", "NO_DISPONIBLE", "VACIO", "DISPONIBLE"] as const;

/**
 * Lee lo ya persistido para la ficha. Solo lectura: renderizar la página nunca llama a Zoom,
 * no ejecuta backfill ni escribe asistencia.
 */
export async function leerAsistenciaZoomFicha(
  instanciaId: string,
  actor: ActorConciliacionZoom
): Promise<AsistenciaZoomFicha> {
  const evento = await db.eventoProveedor.findFirst({
    where: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } },
    select: {
      id: true,
      instancia: {
        select: {
          solicitud: { select: { docentePrograma: { select: { docente: { select: { usuarioId: true } } } } } }
        }
      },
      ocurrenciasArchivoZoom: {
        orderBy: { inicioRealAt: "asc" },
        select: {
          id: true,
          inicioRealAt: true,
          estadoAsistencia: true,
          sesionesAsistencia: {
            select: {
              claveSesion: true,
              participanteId: true,
              userId: true,
              nombre: true,
              email: true,
              entradaAt: true,
              salidaAt: true,
              status: true,
              rol: true
            }
          }
        }
      }
    }
  });
  if (!evento) {
    return {
      estadoReporte: "SIN_OCURRENCIAS",
      registros: [],
      ocurrencias: [],
      invitados: [],
      puedeConciliar: false
    };
  }

  const [registros, invitados] = await Promise.all([
    db.registroAsistenciaZoom.findMany({
      where: { eventoProveedorId: evento.id },
      orderBy: [{ primeraEntradaAt: "asc" }, { nombre: "asc" }]
    }),
    db.invitadoReunion.findMany({
      where: { instanciaSalaId: instanciaId },
      orderBy: { email: "asc" },
      select: { id: true, email: true, nombre: true }
    })
  ]);
  // Misma regla que la consolidación: el id de Zoom identifica a la persona; sin él cada sesión es aparte.
  const conexionesPorClave = new Map<string, RegistroAsistenciaZoomFicha["conexiones"][number][]>();
  for (const sesion of evento.ocurrenciasArchivoZoom.flatMap((o) => o.sesionesAsistencia)) {
    const clave = sesion.participanteId ? `id:${sesion.participanteId}` : `sesion:${sesion.claveSesion}`;
    conexionesPorClave.set(clave, [
      ...(conexionesPorClave.get(clave) ?? []),
      {
        entradaAt: sesion.entradaAt.toISOString(),
        salidaAt: sesion.salidaAt.toISOString(),
        email: sesion.email,
        status: sesion.status
      }
    ]);
  }
  const estados = evento.ocurrenciasArchivoZoom.map((o) => o.estadoAsistencia);
  const estadoReporte =
    estados.length === 0
      ? ("SIN_OCURRENCIAS" as const)
      : (PRIORIDAD.find((p) => estados.includes(p)) ?? ("PENDIENTE" as const));

  return {
    estadoReporte,
    ocurrencias: evento.ocurrenciasArchivoZoom.map(asistenciaPorOcurrencia),
    registros: registros.map((r) => ({
      id: r.id,
      version: r.version,
      nombre: r.nombre,
      emailObservado: r.emailObservado,
      minutos: Number(r.minutos),
      porcentaje: Number(r.porcentaje),
      sesiones: r.sesiones,
      esHostOCohost: r.esHostOCohost,
      estadoConciliacion: r.estadoConciliacion,
      invitadoReunionId: r.invitadoReunionId,
      conexiones: conexionesPorClave.get(r.claveParticipante) ?? []
    })),
    invitados,
    puedeConciliar: puedeConciliarAsistenciaZoom(actor, {
      titularUsuarioId: evento.instancia.solicitud.docentePrograma.docente.usuarioId
    })
  };
}
