import type { PrismaClient } from "@prisma/client";
import type { ConciliacionAsistenciaZoomRepositoryPort, SincronizacionAsistenciaZoomPort } from "../../ports";

export type PrismaAsistenciaZoomLecturaDeps = Readonly<{ db: PrismaClient }>;

export function crearPrismaConciliacionAsistenciaZoomRepositoryAdapter(
  deps: PrismaAsistenciaZoomLecturaDeps
): ConciliacionAsistenciaZoomRepositoryPort {
  const { db } = deps;
  return {
    async obtenerContexto(registroId) {
      const r = await db.registroAsistenciaZoom.findUnique({
        where: { id: registroId },
        select: {
          id: true,
          version: true,
          claveParticipante: true,
          estadoConciliacion: true,
          invitadoReunionId: true,
          esExterno: true,
          eventoProveedor: {
            select: {
              instanciaSalaId: true,
              instancia: {
                select: {
                  solicitud: {
                    select: { docentePrograma: { select: { docente: { select: { usuarioId: true } } } } }
                  }
                }
              }
            }
          }
        }
      });
      if (!r) {
        return null;
      }
      return {
        registroId: r.id,
        version: r.version,
        claveParticipante: r.claveParticipante,
        instanciaId: r.eventoProveedor?.instanciaSalaId ?? null,
        titularUsuarioId: r.eventoProveedor?.instancia.solicitud.docentePrograma.docente.usuarioId ?? null,
        estadoConciliacion: r.estadoConciliacion,
        invitadoReunionId: r.invitadoReunionId,
        esExterno: r.esExterno
      };
    },

    async aplicar(registroId, versionEsperada, cambio, actorUsuarioId) {
      return db.$transaction(async (tx) => {
        const actual = await tx.registroAsistenciaZoom.findUnique({
          where: { id: registroId },
          select: {
            version: true,
            estadoConciliacion: true,
            invitadoReunionId: true,
            esExterno: true,
            eventoProveedor: { select: { instanciaSalaId: true } }
          }
        });
        if (!actual) {
          return { tipo: "NO_ENCONTRADO" as const };
        }
        if (cambio.invitadoReunionId) {
          const invitado = await tx.invitadoReunion.findUnique({
            where: { id: cambio.invitadoReunionId },
            select: { instanciaSalaId: true }
          });
          // Un invitado de otro encuentro nunca se vincula, ni siquiera por una edición legítima.
          if (!invitado || invitado.instanciaSalaId !== actual.eventoProveedor?.instanciaSalaId) {
            return { tipo: "INVITADO_AJENO" as const };
          }
        }
        // La versión va en el WHERE: una edición simultánea deja count = 0 en vez de pisarse.
        const { count } = await tx.registroAsistenciaZoom.updateMany({
          where: { id: registroId, version: versionEsperada },
          data: {
            estadoConciliacion: cambio.estadoConciliacion,
            invitadoReunionId: cambio.invitadoReunionId,
            esExterno: cambio.esExterno,
            version: { increment: 1 }
          }
        });
        if (count === 0) {
          return { tipo: "CONFLICTO" as const };
        }
        await tx.auditoria.create({
          data: {
            actorUsuarioId,
            accion: "ZOOM_ASISTENCIA_CONCILIADA",
            entidadTipo: "RegistroAsistenciaZoom",
            entidadId: registroId,
            valorAnterior: {
              estadoConciliacion: actual.estadoConciliacion,
              invitadoReunionId: actual.invitadoReunionId,
              esExterno: actual.esExterno
            },
            valorNuevo: {
              estadoConciliacion: cambio.estadoConciliacion,
              invitadoReunionId: cambio.invitadoReunionId,
              esExterno: cambio.esExterno
            }
          }
        });
        return { tipo: "APLICADO" as const, version: versionEsperada + 1 };
      });
    }
  };
}

export function crearPrismaSincronizacionAsistenciaZoomAdapter(
  deps: PrismaAsistenciaZoomLecturaDeps
): SincronizacionAsistenciaZoomPort {
  const { db } = deps;
  return {
    async cargarOcurrencia(ocurrenciaId) {
      const o = await db.ocurrenciaArchivoZoom.findUnique({
        where: { id: ocurrenciaId },
        select: {
          id: true,
          uuid: true,
          anfitrionZoomId: true,
          eventoProveedorId: true,
          eventoProveedor: {
            select: { instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } } }
          }
        }
      });
      if (!o) {
        return null;
      }
      return {
        ocurrenciaId: o.id,
        uuid: o.uuid,
        anfitrionZoomId: o.anfitrionZoomId,
        eventoProveedorId: o.eventoProveedorId,
        inicioProgramadoAt: o.eventoProveedor?.instancia.inicioProgramadoAt ?? null,
        finProgramadoAt: o.eventoProveedor?.instancia.finProgramadoAt ?? null
      };
    },

    async listarSesionesDelAmbito(ocurrenciaId) {
      const propia = await db.ocurrenciaArchivoZoom.findUnique({
        where: { id: ocurrenciaId },
        select: { eventoProveedorId: true }
      });
      if (!propia) {
        return [];
      }
      const ocurrencias = await db.ocurrenciaArchivoZoom.findMany({
        where: propia.eventoProveedorId
          ? { eventoProveedorId: propia.eventoProveedorId }
          : { id: ocurrenciaId },
        select: { id: true, sesionesAsistencia: true }
      });
      return ocurrencias.map((o) => ({
        ocurrenciaId: o.id,
        sesiones: o.sesionesAsistencia.map((s) => ({
          claveSesion: s.claveSesion,
          participanteId: s.participanteId,
          userId: s.userId,
          nombre: s.nombre,
          email: s.email,
          entradaAt: s.entradaAt,
          salidaAt: s.salidaAt,
          status: s.status as "in_meeting" | "in_waiting_room" | null,
          rol: s.rol as "HOST" | "COHOST" | null
        }))
      }));
    },

    async marcarEstadoReporte(ocurrenciaId, estado, codigoError) {
      await db.ocurrenciaArchivoZoom.update({
        where: { id: ocurrenciaId },
        data: { estadoAsistencia: estado, errorAsistencia: codigoError }
      });
    }
  };
}
