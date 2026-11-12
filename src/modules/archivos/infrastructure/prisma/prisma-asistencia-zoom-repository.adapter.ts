import type { PrismaClient } from "@prisma/client";
import type { SesionObservadaZoom } from "../../domain";
import type { AsistenciaZoomRepositoryPort, ResultadoConsolidacionAsistencia } from "../../ports";

const SIN_VENTANA = Symbol("sin-ventana");

export type PrismaAsistenciaZoomRepositoryDeps = Readonly<{ db: PrismaClient }>;

const mismaFecha = (a: Date | null | undefined, b: Date | null | undefined): boolean =>
  (a?.getTime() ?? null) === (b?.getTime() ?? null);

export function crearPrismaAsistenciaZoomRepositoryAdapter(
  deps: PrismaAsistenciaZoomRepositoryDeps
): AsistenciaZoomRepositoryPort {
  const { db } = deps;

  const seleccion = {
    id: true,
    uuid: true,
    eventoProveedorId: true,
    eventoProveedor: {
      select: { instancia: { select: { inicioProgramadoAt: true, finProgramadoAt: true } } }
    }
  } as const;

  const adaptador: AsistenciaZoomRepositoryPort = {
    async guardarSesionesYResumen(ocurrenciaId, version, sesiones, resumen) {
      const r = await adaptador.guardarSesionesYConsolidar(ocurrenciaId, version, sesiones, () => resumen);
      // Un resumen fijo nunca devuelve SIN_VENTANA.
      return r.tipo === "SIN_VENTANA" ? { tipo: "REPROGRAMADO" as const } : r;
    },

    async guardarSesionesYConsolidar(
      ocurrenciaId,
      version,
      sesiones,
      consolidar
    ): Promise<ResultadoConsolidacionAsistencia> {
      try {
        return await db.$transaction(async (tx) => {
          const previa = await tx.ocurrenciaArchivoZoom.findUnique({
            where: { id: ocurrenciaId },
            select: { id: true, eventoProveedorId: true }
          });
          if (!previa) {
            return { tipo: "OCURRENCIA_NO_ENCONTRADA" as const };
          }
          // Serializa por ámbito: otra sincronización del mismo encuentro espera a que esta confirme, y entonces
          // lee todas las sesiones ya confirmadas. Se relee la ocurrencia tras obtener el bloqueo.
          const claveBloqueo = previa.eventoProveedorId
            ? `evento:${previa.eventoProveedorId}`
            : `ocurrencia:${previa.id}`;
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`zoom-asistencia:${claveBloqueo}`}, 0))`;
          const ocurrencia = await tx.ocurrenciaArchivoZoom.findUnique({
            where: { id: ocurrenciaId },
            select: seleccion
          });
          if (!ocurrencia) {
            return { tipo: "OCURRENCIA_NO_ENCONTRADA" as const };
          }

          // Si se reprogramó mientras se obtenía el reporte, la atribución por horario ya no es válida.
          const instancia = ocurrencia.eventoProveedor?.instancia ?? null;
          if (
            ocurrencia.uuid !== version.uuid ||
            ocurrencia.eventoProveedorId !== version.eventoProveedorId ||
            !mismaFecha(instancia?.inicioProgramadoAt, version.inicioProgramadoAt) ||
            !mismaFecha(instancia?.finProgramadoAt, version.finProgramadoAt)
          ) {
            return { tipo: "REPROGRAMADO" as const };
          }

          // Las sesiones son inmutables por clave: reintentar el mismo reporte no duplica nada.
          const { count: sesionesNuevas } = await tx.sesionAsistenciaZoom.createMany({
            data: sesiones.map((s) => ({
              ocurrenciaId,
              claveSesion: s.claveSesion,
              participanteId: s.participanteId,
              userId: s.userId,
              nombre: s.nombre,
              email: s.email,
              entradaAt: s.entradaAt,
              salidaAt: s.salidaAt,
              status: s.status,
              rol: s.rol
            })),
            skipDuplicates: true
          });

          const claveAmbito = ocurrencia.eventoProveedorId
            ? `evento:${ocurrencia.eventoProveedorId}`
            : `ocurrencia:${ocurrencia.id}`;
          // Con el bloqueo tomado y las sesiones nuevas ya insertadas, se leen TODAS las del ámbito para consolidar.
          const ocurrenciasAmbito = await tx.ocurrenciaArchivoZoom.findMany({
            where: ocurrencia.eventoProveedorId
              ? { eventoProveedorId: ocurrencia.eventoProveedorId }
              : { id: ocurrencia.id },
            select: { id: true, sesionesAsistencia: true }
          });
          const resumen = consolidar(
            ocurrenciasAmbito.map((o) => ({
              ocurrenciaId: o.id,
              sesiones: o.sesionesAsistencia.map((s): SesionObservadaZoom => ({
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
            }))
          );
          // Sin ventana no se guarda nada: se revierte lo insertado en esta transacción.
          if (resumen === null) {
            throw SIN_VENTANA;
          }
          const unicos = [...new Map(resumen.map((r) => [r.claveParticipante, r])).values()];
          const existentes = new Set(
            (
              await tx.registroAsistenciaZoom.findMany({
                where: { claveAmbito, claveParticipante: { in: unicos.map((r) => r.claveParticipante) } },
                select: { claveParticipante: true }
              })
            ).map((e) => e.claveParticipante)
          );

          const nuevos = unicos.filter((r) => !existentes.has(r.claveParticipante));
          let registrosCreados = 0;
          if (nuevos.length > 0) {
            const { count } = await tx.registroAsistenciaZoom.createMany({
              data: nuevos.map((r) => ({
                claveAmbito,
                eventoProveedorId: ocurrencia.eventoProveedorId,
                ocurrenciaId: ocurrencia.id,
                claveParticipante: r.claveParticipante,
                nombre: r.nombre,
                emailObservado: r.emailObservado,
                minutos: r.minutos,
                porcentaje: r.porcentaje,
                sesiones: r.sesiones,
                primeraEntradaAt: r.primeraEntradaAt,
                ultimaSalidaAt: r.ultimaSalidaAt,
                esHostOCohost: r.esHostOCohost
              })),
              skipDuplicates: true
            });
            registrosCreados = count;
          }

          let registrosActualizados = 0;
          for (const r of unicos.filter((u) => existentes.has(u.claveParticipante))) {
            // Solo campos calculados: conciliación, invitado, marca externa, notas y versión son de las personas.
            const { count } = await tx.registroAsistenciaZoom.updateMany({
              where: { claveAmbito, claveParticipante: r.claveParticipante },
              data: {
                nombre: r.nombre,
                emailObservado: r.emailObservado,
                minutos: r.minutos,
                porcentaje: r.porcentaje,
                sesiones: r.sesiones,
                primeraEntradaAt: r.primeraEntradaAt,
                ultimaSalidaAt: r.ultimaSalidaAt,
                esHostOCohost: r.esHostOCohost
              }
            });
            registrosActualizados += count;
          }

          return { tipo: "GUARDADO" as const, sesionesNuevas, registrosCreados, registrosActualizados };
        });
      } catch (error) {
        if (error === SIN_VENTANA) {
          return { tipo: "SIN_VENTANA" };
        }
        throw error;
      }
    }
  };
  return adaptador;
}
