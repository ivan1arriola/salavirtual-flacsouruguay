import type { PrismaClient } from "@prisma/client";
import {
  calcularMinutos,
  calcularMonto,
  minutosTotales,
  resumirAsignacionesPorAsistente,
  resumirAsistencias,
  type FilaPlanillaPago,
  type FilaResumenAsistente,
  type PeriodoMes,
  type PeriodoReporteMensual,
  type RegistroAsistenciaLiquidacion
} from "../../domain";
import type {
  CandidatoReporteMensual,
  LiquidacionesRepositoryPort,
  ReservaEnvioReporteInput
} from "../../ports";

export function crearPrismaLiquidacionesRepositoryAdapter(db: PrismaClient): LiquidacionesRepositoryPort {
  return {
    async obtenerFilasPlanillaPagos(periodo: PeriodoReporteMensual): Promise<readonly FilaPlanillaPago[]> {
      const assignments = await db.asignacionAsistenciaTecnica.findMany({
        where: {
          estado: { in: ["ASIGNADO", "ACEPTADO"] },
          instancia: {
            requiereAsistenciaTecnica: true,
            estado: { notIn: ["CANCELADA", "NO_REALIZADA"] },
            solicitud: { estado: { not: "CANCELADA" } },
            inicioProgramadoAt: {
              gte: new Date(periodo.desdeMs),
              lt: new Date(periodo.hastaMs)
            }
          }
        },
        include: {
          asistenteTecnico: { include: { usuario: true } },
          instancia: {
            include: {
              solicitud: {
                include: {
                  docentePrograma: { include: { programa: true } }
                }
              }
            }
          }
        }
      });

      return assignments.map((assignment) => {
        const meeting = assignment.instancia;
        const minutes = calcularMinutos(
          {
            inicio: meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt,
            fin: meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt
          },
          assignment.minutosConfirmados,
          meeting.minutosReportados,
          { inicio: meeting.inicioRealAt, fin: meeting.finRealAt }
        );
        const tarifaHora = assignment.tarifaHoraAplicada?.toNumber() ?? null;
        const montoConfirmado = assignment.montoConfirmado?.toNumber() ?? null;
        const usuario = assignment.asistenteTecnico.usuario;

        return {
          asistente: `${usuario.nombres} ${usuario.apellidos ?? ""}`.trim(),
          programa: meeting.solicitud.docentePrograma.programa.nombre,
          reunion: meeting.solicitud.titulo,
          fecha: meeting.inicioProgramadoAt,
          minutos: minutes,
          modalidad: meeting.modalidadOverride ?? meeting.solicitud.modalidad,
          tarifaHora,
          montoConfirmado,
          montoCalculado: calcularMonto(montoConfirmado, tarifaHora, minutes),
          moneda: assignment.moneda ?? "UYU"
        };
      });
    },

    async obtenerResumenAsistentes(periodo: PeriodoMes): Promise<readonly FilaResumenAsistente[]> {
      const [assistants, assignments] = await Promise.all([
        db.asistenteTecnico.findMany({
          orderBy: { usuario: { nombres: "asc" } },
          include: { usuario: true }
        }),
        db.asignacionAsistenciaTecnica.findMany({
          where: {
            estado: { in: ["ASIGNADO", "ACEPTADO"] },
            instancia: {
              requiereAsistenciaTecnica: true,
              estado: { notIn: ["CANCELADA", "NO_REALIZADA"] },
              solicitud: { estado: { not: "CANCELADA" } },
              inicioProgramadoAt: {
                gte: new Date(periodo.desdeMs),
                lt: new Date(periodo.hastaMs)
              }
            }
          },
          include: { instancia: { include: { solicitud: true } } }
        })
      ]);

      return resumirAsignacionesPorAsistente(
        assistants.map(({ id, slug, usuario }) => ({
          id,
          usuarioId: usuario.id,
          slug,
          nombre: `${usuario.nombres} ${usuario.apellidos ?? ""}`.trim(),
          email: usuario.emailPrincipal,
          activo: usuario.activo
        })),
        assignments.map((assignment) => {
          const meeting = assignment.instancia;
          const minutes = calcularMinutos(
            {
              inicio: meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt,
              fin: meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt
            },
            assignment.minutosConfirmados,
            meeting.minutosReportados,
            { inicio: meeting.inicioRealAt, fin: meeting.finRealAt }
          );
          const rate = assignment.tarifaHoraAplicada?.toNumber() ?? null;
          return {
            asistenteTecnicoId: assignment.asistenteTecnicoId,
            modalidad: meeting.modalidadOverride ?? meeting.solicitud.modalidad,
            minutos: minutes,
            monto: calcularMonto(assignment.montoConfirmado?.toNumber() ?? null, rate, minutes),
            moneda: assignment.moneda ?? "UYU"
          };
        })
      );
    },

    async obtenerCandidatosReporteMensual(
      periodo: PeriodoReporteMensual,
      _ahora: Date
    ): Promise<readonly CandidatoReporteMensual[]> {
      const rango = { desde: new Date(periodo.desdeMs), hasta: new Date(periodo.hastaMs) };
      const candidatos = await db.asistenteTecnico.findMany({
        orderBy: { usuario: { nombres: "asc" } },
        select: {
          id: true,
          usuarioId: true,
          usuario: { select: { nombres: true, apellidos: true, emailPrincipal: true, activo: true } }
        }
      });

      const resultado: CandidatoReporteMensual[] = [];

      for (const asistente of candidatos) {
        const asignaciones = await db.asignacionAsistenciaTecnica.findMany({
          where: {
            asistenteTecnicoId: asistente.id,
            estado: { in: ["ASIGNADO", "ACEPTADO"] },
            instancia: {
              requiereAsistenciaTecnica: true,
              estado: { notIn: ["CANCELADA", "NO_REALIZADA"] },
              inicioProgramadoAt: { gte: rango.desde, lt: rango.hasta },
              solicitud: { estado: { not: "CANCELADA" } }
            }
          },
          include: { instancia: { include: { solicitud: true } } }
        });

        const registros: RegistroAsistenciaLiquidacion[] = asignaciones.map((asignacion) => {
          const meeting = asignacion.instancia;
          const minutes = calcularMinutos(
            {
              inicio: meeting.inicioAsistenciaTecnicaAt ?? meeting.inicioProgramadoAt,
              fin: meeting.finAsistenciaTecnicaAt ?? meeting.finProgramadoAt
            },
            asignacion.minutosConfirmados,
            meeting.minutosReportados,
            { inicio: meeting.inicioRealAt, fin: meeting.finRealAt }
          );
          const rate = asignacion.tarifaHoraAplicada?.toNumber() ?? null;
          return {
            modalidad: meeting.modalidadOverride ?? meeting.solicitud.modalidad,
            minutos: minutes,
            monto: calcularMonto(asignacion.montoConfirmado?.toNumber() ?? null, rate, minutes)
          };
        });

        if (!asistente.usuario.activo && registros.length === 0) {
          continue;
        }

        const resumen = resumirAsistencias(registros);
        const nombre = `${asistente.usuario.nombres} ${asistente.usuario.apellidos ?? ""}`.trim();

        resultado.push({
          asistenteTecnicoId: asistente.id,
          usuarioId: asistente.usuarioId,
          nombre,
          destinatario: asistente.usuario.emailPrincipal,
          activo: asistente.usuario.activo,
          resumen
        });
      }

      return resultado;
    },

    async obtenerCopiasAdministracion(): Promise<readonly string[]> {
      const [administradores, configuracion] = await Promise.all([
        db.usuario.findMany({
          where: { rol: "ADMINISTRACION", activo: true, emailPrincipal: { not: null } },
          select: { emailPrincipal: true }
        }),
        db.configuracionAsistenciaTecnica.findUnique({
          where: { id: "principal" },
          select: { correosCopiaReporteMensual: true }
        })
      ]);

      const correos = [
        ...administradores.flatMap(({ emailPrincipal }) => (emailPrincipal ? [emailPrincipal] : [])),
        ...(configuracion?.correosCopiaReporteMensual ?? [])
      ];

      return [...new Set(correos.map((e) => e.trim().toLowerCase()).filter(Boolean))];
    },

    async reservarEnvioReporte(input: ReservaEnvioReporteInput): Promise<Readonly<{ id: string }> | null> {
      const where = {
        asistenteTecnicoId_periodo: {
          asistenteTecnicoId: input.asistenteTecnicoId,
          periodo: input.periodo
        }
      } as const;

      const existing = await db.envioReporteMensualAsistencia.findUnique({
        where,
        select: { id: true, estado: true }
      });

      const snapshot = {
        minutosTotal: minutosTotales(input.resumen),
        minutosVirtuales: input.resumen.minutosVirtuales,
        minutosHibridos: input.resumen.minutosHibridos,
        reuniones: input.resumen.reuniones,
        destinatario: input.destinatario,
        copias: [...input.copias]
      };

      if (existing) {
        if (existing.estado !== "ERROR") {
          return null;
        }
        const claimed = await db.envioReporteMensualAsistencia.updateMany({
          where: { id: existing.id, estado: "ERROR" },
          data: {
            estado: "PENDIENTE",
            intentos: { increment: 1 },
            ultimoError: null,
            ...snapshot
          }
        });
        return claimed.count === 1 ? { id: existing.id } : null;
      }

      try {
        return await db.envioReporteMensualAsistencia.create({
          data: {
            asistenteTecnicoId: input.asistenteTecnicoId,
            periodo: input.periodo,
            ...snapshot
          },
          select: { id: true }
        });
      } catch (error) {
        if (typeof error === "object" && error !== null && "code" in error && error.code === "P2002") {
          return null;
        }
        throw error;
      }
    },

    async marcarEnvioReporteExitoso(id: string, enviadoAt: Date): Promise<void> {
      await db.envioReporteMensualAsistencia.update({
        where: { id },
        data: { estado: "ENVIADO", enviadoAt, ultimoError: null }
      });
    },

    async marcarEnvioReporteError(id: string, error: string): Promise<void> {
      await db.envioReporteMensualAsistencia.update({
        where: { id },
        data: { estado: "ERROR", ultimoError: error.slice(0, 1000) }
      });
    }
  };
}
