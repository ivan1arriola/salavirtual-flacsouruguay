import type { PrismaClient } from "@prisma/client";
import {
  calcularMinutos,
  calcularMonto,
  esAsistenciaCompletada,
  rangoMesUtc3,
  type RegistroAsistenciaPersonal
} from "./resumen-personal.domain";

type PeriodoPersonal = "MES_ACTUAL" | "HISTORICO";

export async function obtenerAsistenciasPersonales(
  db: PrismaClient,
  usuarioId: string,
  periodo: PeriodoPersonal,
  ahora = new Date()
): Promise<readonly RegistroAsistenciaPersonal[]> {
  const month = rangoMesUtc3(ahora);
  return obtenerAsistenciasEnRango(
    db,
    usuarioId,
    periodo === "MES_ACTUAL"
      ? { desde: new Date(month.desdeMs), hasta: new Date(month.hastaMs) }
      : { hasta: new Date(month.desdeMs) },
    ahora,
    periodo === "MES_ACTUAL" ? "asc" : "desc",
    periodo === "MES_ACTUAL" ? 100 : 500
  );
}

export async function obtenerAsistenciasEnRango(
  db: PrismaClient,
  usuarioId: string,
  rango: Readonly<{ desde?: Date; hasta: Date }>,
  ahora = new Date(),
  orden: "asc" | "desc" = "asc",
  limite = 500
): Promise<readonly RegistroAsistenciaPersonal[]> {
  const asistente = await db.asistenteTecnico.findUnique({
    where: { usuarioId },
    select: { id: true }
  });
  if (!asistente) return [];

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
    orderBy: { instancia: { inicioProgramadoAt: orden } },
    take: limite,
    include: {
      instancia: {
        include: {
          solicitud: {
            include: {
              docentePrograma: {
                include: {
                  programa: true,
                  docente: { include: { usuario: true } }
                }
              }
            }
          }
        }
      }
    }
  });

  return asignaciones.map((asignacion) => {
    const instancia = asignacion.instancia;
    const asociacion = instancia.solicitud.docentePrograma;
    const minutosProgramados = calcularMinutos(
      { inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt },
      null,
      null,
      { inicio: null, fin: null }
    );
    const minutos = calcularMinutos(
      { inicio: instancia.inicioProgramadoAt, fin: instancia.finProgramadoAt },
      asignacion.minutosConfirmados,
      instancia.minutosReportados,
      { inicio: instancia.inicioRealAt, fin: instancia.finRealAt }
    );
    const tarifaHora = asignacion.tarifaHoraAplicada?.toNumber() ?? null;
    return {
      id: asignacion.id,
      instanciaId: instancia.id,
      titulo: instancia.solicitud.titulo,
      programa: asociacion.programa.nombre,
      docente: `${asociacion.docente.usuario.nombres} ${asociacion.docente.usuario.apellidos ?? ""}`.trim(),
      inicioAt: instancia.inicioProgramadoAt,
      finAt: instancia.finProgramadoAt,
      inicioRealAt: instancia.inicioRealAt,
      finRealAt: instancia.finRealAt,
      modalidad: instancia.solicitud.modalidad,
      estado: instancia.estado,
      completada: esAsistenciaCompletada(
        instancia.estado,
        instancia.finProgramadoAt.getTime(),
        ahora.getTime()
      ),
      cierreConfirmado: asignacion.minutosConfirmados !== null,
      minutos,
      minutosProgramados,
      minutosReportados: instancia.minutosReportados,
      comentarioReporte: instancia.comentariosReporte,
      tarifaHora,
      monto: calcularMonto(asignacion.montoConfirmado?.toNumber() ?? null, tarifaHora, minutos),
      moneda: asignacion.moneda ?? "UYU"
    };
  });
}
