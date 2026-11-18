import type { Prisma, TipoProveedor } from "@prisma/client";

export type ResultadoVinculoAutomaticoZoom =
  | Readonly<{ tipo: "VINCULADA"; eventoProveedorId: string }>
  | Readonly<{ tipo: "YA_VINCULADA" }>
  | Readonly<{ tipo: "AMBIGUA" }>
  | Readonly<{ tipo: "SIN_COINCIDENCIA" }>;

type CriterioVinculo = "UUID_EXACTO" | "REUNION_Y_HORARIO";

/** Una reunión puede empezar hasta 45 minutos antes de su horario programado. */
const TOLERANCIA_INICIO_ANTICIPADO_MS = 45 * 60_000;
const TIPOS_ZOOM: TipoProveedor[] = ["ZOOM", "ZOOM_HISTORICO"];

/**
 * Vincula una ocurrencia a su encuentro solo cuando la coincidencia es inequívoca:
 *  1. UN único evento Zoom con ese UUID exacto; o, si ninguno lo tiene,
 *  2. UN único encuentro de ese mismo número de reunión cuyo horario programado contiene el inicio real
 *     (o, solo si ninguno lo contiene, uno que empiece como máximo 45 min después: inicio anticipado).
 * Una reunión Zoom solo puede estar en curso una vez a la vez, así que número de reunión + horario identifica
 * el encuentro de una serie. Cualquier duda (varios, ninguno) queda pendiente de vínculo manual: nunca se
 * adivina por título ni docente, y un UUID ambiguo no se resuelve por horario.
 */
export async function vincularAutomaticamenteSiInequivoco(
  tx: Prisma.TransactionClient,
  entrada: Readonly<{
    ocurrenciaId: string;
    uuid: string;
    meetingId: string;
    inicioRealAt: Date;
    eventoProveedorId: string | null;
    ahora: Date;
  }>
): Promise<ResultadoVinculoAutomaticoZoom> {
  if (entrada.eventoProveedorId !== null) {
    return { tipo: "YA_VINCULADA" };
  }

  const porUuid = await tx.eventoProveedor.findMany({
    where: { zoomMeetingUuid: entrada.uuid, proveedor: { tipo: { in: TIPOS_ZOOM } } },
    select: { id: true },
    take: 2
  });
  if (porUuid.length > 1) {
    return { tipo: "AMBIGUA" };
  }
  if (porUuid.length === 1) {
    return vincular(tx, entrada, porUuid[0]!.id, "UUID_EXACTO");
  }

  const real = entrada.inicioRealAt;
  const base = { externalEventId: entrada.meetingId, proveedor: { tipo: { in: TIPOS_ZOOM } } };
  const seleccion = { id: true } as const;
  // Primero los encuentros cuyo horario contiene el inicio: take 2 basta para detectar la ambigüedad.
  const contienen = await tx.eventoProveedor.findMany({
    where: {
      ...base,
      instancia: { inicioProgramadoAt: { lte: real }, finProgramadoAt: { gte: real } }
    },
    select: seleccion,
    orderBy: { id: "asc" },
    take: 2
  });
  // Solo si ninguno lo contiene se admite un inicio anticipado (hasta 45 min antes del horario).
  const elegidos =
    contienen.length > 0
      ? contienen
      : await tx.eventoProveedor.findMany({
          where: {
            ...base,
            instancia: {
              inicioProgramadoAt: { gt: real, lte: new Date(real.getTime() + TOLERANCIA_INICIO_ANTICIPADO_MS) },
              finProgramadoAt: { gte: real }
            }
          },
          select: seleccion,
          orderBy: { id: "asc" },
          take: 2
        });
  if (elegidos.length === 0) {
    return { tipo: "SIN_COINCIDENCIA" };
  }
  if (elegidos.length > 1) {
    return { tipo: "AMBIGUA" };
  }
  return vincular(tx, entrada, elegidos[0]!.id, "REUNION_Y_HORARIO");
}

async function vincular(
  tx: Prisma.TransactionClient,
  entrada: Readonly<{ ocurrenciaId: string; ahora: Date }>,
  eventoProveedorId: string,
  criterio: CriterioVinculo
): Promise<ResultadoVinculoAutomaticoZoom> {
  // Condicional: si otra operación la vinculó entre medias no se pisa ni se audita.
  const { count } = await tx.ocurrenciaArchivoZoom.updateMany({
    where: { id: entrada.ocurrenciaId, eventoProveedorId: null },
    data: { eventoProveedorId, vinculadaAt: entrada.ahora, vinculadaPorId: null }
  });
  if (count === 0) {
    return { tipo: "YA_VINCULADA" };
  }
  await tx.auditoria.create({
    data: {
      actorUsuarioId: null,
      accion: "ZOOM_OCURRENCIA_VINCULADA_AUTO",
      entidadTipo: "OcurrenciaArchivoZoom",
      entidadId: entrada.ocurrenciaId,
      valorAnterior: { eventoProveedorId: null },
      valorNuevo: { eventoProveedorId, criterio }
    }
  });
  return { tipo: "VINCULADA", eventoProveedorId };
}
