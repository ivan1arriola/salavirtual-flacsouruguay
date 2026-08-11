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
        { inicio: meeting.inicioProgramadoAt, fin: meeting.finProgramadoAt },
        assignment.minutosConfirmados,
        meeting.minutosReportados,
        { inicio: meeting.inicioRealAt, fin: meeting.finRealAt }
      );
      const rate = assignment.tarifaHoraAplicada?.toNumber() ?? null;
      return {
        asistenteTecnicoId: assignment.asistenteTecnicoId,
        modalidad: meeting.solicitud.modalidad,
        minutos: minutes,
        monto: calcularMonto(assignment.montoConfirmado?.toNumber() ?? null, rate, minutes),
        moneda: assignment.moneda ?? "UYU"
      };
    })
  );
}
