import type { PrismaClient } from "@prisma/client";
import {
  normalizarCorreosCopiaReporte,
  puedeConfigurarAsistenciaTecnica,
  type ActorConfiguracionAsistencia
} from "./asistencia-tecnica.domain";

export async function actualizarConfiguracionAsistenciaTecnica(
  db: PrismaClient,
  actor: ActorConfiguracionAsistencia,
  input: Readonly<{ correosCopiaReporteMensual: unknown }>
): Promise<readonly string[]> {
  if (!puedeConfigurarAsistenciaTecnica(actor)) {
    throw new Error("Solo Administración puede configurar los reportes de monitoreo.");
  }
  const correos = normalizarCorreosCopiaReporte(input.correosCopiaReporteMensual);

  return db.$transaction(async (tx) => {
    const actorActual = await tx.usuario.findUnique({
      where: { id: actor.id },
      select: { id: true, rol: true, activo: true }
    });
    if (!actorActual || !puedeConfigurarAsistenciaTecnica(actorActual)) {
      throw new Error("La sesión no corresponde a un usuario vigente de Administración.");
    }

    const actual = await tx.configuracionAsistenciaTecnica.findUnique({
      where: { id: "principal" },
      select: { correosCopiaReporteMensual: true }
    });
    const configuracion = await tx.configuracionAsistenciaTecnica.upsert({
      where: { id: "principal" },
      create: {
        id: "principal",
        correosCopiaReporteMensual: correos,
        actualizadaPorId: actorActual.id
      },
      update: {
        correosCopiaReporteMensual: correos,
        actualizadaPorId: actorActual.id
      },
      select: { correosCopiaReporteMensual: true }
    });

    await tx.auditoria.create({
      data: {
        actorUsuarioId: actorActual.id,
        accion: "CONFIGURACION_REPORTES_ASISTENCIA_ACTUALIZADA",
        entidadTipo: "ConfiguracionAsistenciaTecnica",
        entidadId: "principal",
        valorAnterior: actual ? { correosCopiaReporteMensual: actual.correosCopiaReporteMensual } : undefined,
        valorNuevo: { correosCopiaReporteMensual: configuracion.correosCopiaReporteMensual }
      }
    });

    return configuracion.correosCopiaReporteMensual;
  });
}
