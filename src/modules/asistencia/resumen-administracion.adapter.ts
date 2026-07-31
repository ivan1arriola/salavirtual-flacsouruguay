import type { PrismaClient } from "@prisma/client";
import { calcularMinutos, calcularMonto } from "./resumen-personal.domain";
import {
  resumirAsignacionesPorAsistente,
  type FilaResumenAsistente,
  type PeriodoMes
} from "./resumen-administracion.domain";

export async function obtenerResumenAsistentes(
  db: PrismaClient,
  periodo: PeriodoMes
): Promise<readonly FilaResumenAsistente[]> {
  const [assistants, assignments] = await Promise.all([
    db.asistente.findMany({
      orderBy: { usuario: { nombres: "asc" } },
      include: { usuario: true }
    }),
    db.asignacionAsistente.findMany({
      where: {
        estado: { in: ["ASIGNADO", "ACEPTADO"] },
        instancia: {
          estado: { notIn: ["CANCELADA", "NO_REALIZADA"] },
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
    assistants.map(({ id, usuario }) => ({
      id,
      usuarioId: usuario.id,
      nombre: `${usuario.nombres} ${usuario.apellidos ?? ""}`.trim(),
      email: usuario.emailPrincipal,
      activo: usuario.activo
    })),
    assignments.map((assignment) => {
      const meeting = assignment.instancia;
      const minutes = calcularMinutos(
        { inicio: meeting.inicioProgramadoAt, fin: meeting.finProgramadoAt },
        assignment.minutosConfirmados,
        meeting.minutosReportados,
        { inicio: meeting.inicioRealAt, fin: meeting.finRealAt }
      );
      const rate = assignment.tarifaHoraAplicada?.toNumber() ?? null;
      return {
        asistenteId: assignment.asistenteId,
        modalidad: meeting.solicitud.modalidad,
        minutos: minutes,
        monto: calcularMonto(assignment.montoConfirmado?.toNumber() ?? null, rate, minutes),
        moneda: assignment.moneda ?? "UYU"
      };
    })
  );
}
