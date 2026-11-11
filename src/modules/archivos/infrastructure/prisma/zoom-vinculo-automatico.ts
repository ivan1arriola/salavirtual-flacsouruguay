import type { Prisma } from "@prisma/client";

export type ResultadoVinculoAutomaticoZoom =
  | Readonly<{ tipo: "VINCULADA"; eventoProveedorId: string }>
  | Readonly<{ tipo: "YA_VINCULADA" }>
  | Readonly<{ tipo: "AMBIGUA" }>
  | Readonly<{ tipo: "SIN_COINCIDENCIA" }>;

/**
 * Vincula una ocurrencia a su encuentro solo si UN ÚNICO evento Zoom coincide con su UUID exacto. Cualquier
 * duda (varios, ninguno) la deja pendiente de vínculo manual: nunca se adivina por título, fecha ni número de
 * reunión, porque una serie comparte un mismo ID numérico entre todos sus encuentros.
 */
export async function vincularAutomaticamenteSiInequivoco(
  tx: Prisma.TransactionClient,
  entrada: Readonly<{ ocurrenciaId: string; uuid: string; eventoProveedorId: string | null; ahora: Date }>
): Promise<ResultadoVinculoAutomaticoZoom> {
  if (entrada.eventoProveedorId !== null) return { tipo: "YA_VINCULADA" };
  const candidatos = await tx.eventoProveedor.findMany({
    where: { zoomMeetingUuid: entrada.uuid, proveedor: { tipo: { in: ["ZOOM", "ZOOM_HISTORICO"] } } },
    select: { id: true },
    take: 2
  });
  if (candidatos.length === 0) return { tipo: "SIN_COINCIDENCIA" };
  if (candidatos.length > 1) return { tipo: "AMBIGUA" };
  const evento = candidatos[0]!;
  // Condicional: si otra operación la vinculó entre medias no se pisa ni se audita.
  const { count } = await tx.ocurrenciaArchivoZoom.updateMany({
    where: { id: entrada.ocurrenciaId, eventoProveedorId: null },
    data: { eventoProveedorId: evento.id, vinculadaAt: entrada.ahora, vinculadaPorId: null }
  });
  if (count === 0) return { tipo: "YA_VINCULADA" };
  await tx.auditoria.create({
    data: {
      actorUsuarioId: null, accion: "ZOOM_OCURRENCIA_VINCULADA_AUTO",
      entidadTipo: "OcurrenciaArchivoZoom", entidadId: entrada.ocurrenciaId,
      valorAnterior: { eventoProveedorId: null }, valorNuevo: { eventoProveedorId: evento.id, criterio: "UUID_EXACTO" }
    }
  });
  return { tipo: "VINCULADA", eventoProveedorId: evento.id };
}
