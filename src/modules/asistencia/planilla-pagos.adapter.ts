import type { PrismaClient } from "@prisma/client";
import { calcularMinutos, calcularMonto } from "./resumen-personal.domain";
import type { PeriodoReporteMensual } from "./reporte-mensual.domain";

export type FilaPlanillaPago = Readonly<{
  asistente: string;
  programa: string;
  reunion: string;
  fecha: Date;
  minutos: number;
  modalidad: "VIRTUAL" | "HIBRIDA";
  tarifaHora: number | null;
  montoConfirmado: number | null;
  montoCalculado: number | null;
  moneda: string;
}>;

export async function obtenerFilasPlanillaPagos(
  db: PrismaClient,
  periodo: PeriodoReporteMensual
): Promise<readonly FilaPlanillaPago[]> {
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
      { inicio: meeting.inicioProgramadoAt, fin: meeting.finProgramadoAt },
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
      modalidad: meeting.solicitud.modalidad,
      tarifaHora,
      montoConfirmado,
      montoCalculado: calcularMonto(montoConfirmado, tarifaHora, minutes),
      moneda: assignment.moneda ?? "UYU"
    };
  });
}
