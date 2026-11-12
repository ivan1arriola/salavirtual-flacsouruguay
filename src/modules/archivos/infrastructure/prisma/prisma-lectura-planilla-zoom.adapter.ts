import type { PrismaClient } from "@prisma/client";
import type { RegistroPlanillaZoom, SesionPlanillaZoom } from "../../domain";
import type { DatosPlanillaAsistenciaZoom, LecturaPlanillaAsistenciaZoomPort } from "../../ports";

export type AsistenciaZoomInstancia = Readonly<{
  registros: readonly RegistroPlanillaZoom[];
  sesiones: readonly SesionPlanillaZoom[];
}>;

export type LecturaAsistenciaZoom = LecturaPlanillaAsistenciaZoomPort &
  Readonly<{
    /** Lo guardado para el encuentro Zoom de una instancia; null si la instancia no tiene encuentro Zoom. */
    cargarAsistenciaInstancia(instanciaId: string): Promise<AsistenciaZoomInstancia | null>;
  }>;

const rolComprobado = (esHostOCohost: boolean): "HOST" | null => (esHostOCohost ? "HOST" : null);

export function crearPrismaLecturaPlanillaZoomAdapter(
  deps: Readonly<{ db: PrismaClient }>
): LecturaAsistenciaZoom {
  const { db } = deps;

  const aRegistro = (r: {
    nombre: string;
    emailObservado: string | null;
    primeraEntradaAt: Date | null;
    ultimaSalidaAt: Date | null;
    minutos: unknown;
    porcentaje: unknown;
    sesiones: number;
    esHostOCohost: boolean;
    estadoConciliacion: RegistroPlanillaZoom["estadoConciliacion"];
    invitadoReunion: { email: string } | null;
  }): RegistroPlanillaZoom => ({
    nombre: r.nombre,
    emailObservado: r.emailObservado,
    // Solo un vínculo CONCILIADO confirma el correo: una sugerencia no.
    emailConfirmado: r.estadoConciliacion === "CONCILIADO" ? (r.invitadoReunion?.email ?? null) : null,
    primeraEntradaAt: r.primeraEntradaAt,
    ultimaSalidaAt: r.ultimaSalidaAt,
    minutos: Number(r.minutos),
    porcentaje: Number(r.porcentaje),
    sesiones: r.sesiones,
    estadoConciliacion: r.estadoConciliacion,
    // El reporte de participantes no comprueba roles: el marcador solo viene de una verificación explícita.
    rolComprobado: rolComprobado(r.esHostOCohost)
  });
  const aSesion = (s: {
    nombre: string;
    email: string | null;
    entradaAt: Date;
    salidaAt: Date;
    status: string | null;
    participanteId: string | null;
  }): SesionPlanillaZoom => ({
    nombre: s.nombre,
    email: s.email,
    entradaAt: s.entradaAt,
    salidaAt: s.salidaAt,
    status: s.status,
    participanteId: s.participanteId
  });
  const seleccionRegistro = {
    nombre: true,
    emailObservado: true,
    primeraEntradaAt: true,
    ultimaSalidaAt: true,
    minutos: true,
    porcentaje: true,
    sesiones: true,
    esHostOCohost: true,
    estadoConciliacion: true,
    invitadoReunion: { select: { email: true } }
  } as const;
  const seleccionSesion = {
    nombre: true,
    email: true,
    entradaAt: true,
    salidaAt: true,
    status: true,
    participanteId: true
  } as const;

  return {
    async cargarDatosPlanilla(ocurrenciaId): Promise<DatosPlanillaAsistenciaZoom | null> {
      const o = await db.ocurrenciaArchivoZoom.findUnique({
        where: { id: ocurrenciaId },
        select: {
          id: true,
          uuid: true,
          titulo: true,
          driveFolderId: true,
          eventoProveedorId: true,
          sesionesAsistencia: { select: seleccionSesion, orderBy: { entradaAt: "asc" } }
        }
      });
      if (!o) {
        return null;
      }
      const registros = await db.registroAsistenciaZoom.findMany({
        where: o.eventoProveedorId ? { eventoProveedorId: o.eventoProveedorId } : { ocurrenciaId: o.id },
        select: seleccionRegistro,
        orderBy: [{ primeraEntradaAt: "asc" }, { nombre: "asc" }]
      });
      return {
        titulo: `Asistencia Zoom · ${o.titulo}`,
        carpetaId: o.driveFolderId,
        marcador: o.eventoProveedorId ? `evento:${o.eventoProveedorId}` : `ocurrencia:${o.id}`,
        registros: registros.map(aRegistro),
        sesiones: o.sesionesAsistencia.map(aSesion)
      };
    },

    async cargarAsistenciaInstancia(instanciaId) {
      const evento = await db.eventoProveedor.findFirst({
        where: { instanciaSalaId: instanciaId, proveedor: { tipo: "ZOOM" } },
        select: {
          id: true,
          ocurrenciasArchivoZoom: {
            select: { sesionesAsistencia: { select: seleccionSesion, orderBy: { entradaAt: "asc" } } }
          }
        }
      });
      if (!evento) {
        return null;
      }
      const registros = await db.registroAsistenciaZoom.findMany({
        where: { eventoProveedorId: evento.id },
        select: seleccionRegistro,
        orderBy: [{ primeraEntradaAt: "asc" }, { nombre: "asc" }]
      });
      return {
        registros: registros.map(aRegistro),
        sesiones: evento.ocurrenciasArchivoZoom.flatMap((o) => o.sesionesAsistencia.map(aSesion))
      };
    }
  };
}
