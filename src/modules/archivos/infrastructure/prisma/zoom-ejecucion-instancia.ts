import type { Prisma } from "@prisma/client";

/**
 * Copia a la instancia las marcas oficiales de Zoom (meeting.started / meeting.ended) de una ejecución.
 * Se usa al procesar el aviso y al vincular después una ocurrencia, para que el orden de llegada no importe.
 * Nunca retrocede un estado ni pisa marcas ya registradas.
 */
export async function aplicarEjecucionZoomAInstancia(
  tx: Prisma.TransactionClient,
  entrada: Readonly<{ instanciaSalaId: string; cuentaZoomId: string; uuid: string }>
): Promise<void> {
  const avisos = await tx.eventoWebhookZoom.findMany({
    where: {
      cuentaZoomId: entrada.cuentaZoomId,
      uuid: entrada.uuid,
      tipo: { in: ["meeting.started", "meeting.ended"] }
    },
    select: { tipo: true, inicioRealAt: true, finRealAt: true },
    orderBy: { ocurridoAt: "asc" }
  });
  const inicio = avisos[0]?.inicioRealAt ?? null;
  const fin = avisos.filter(({ tipo }) => tipo === "meeting.ended").at(-1)?.finRealAt ?? null;
  if (!inicio) {
    return;
  }
  const { instanciaSalaId: id } = entrada;
  await tx.instanciaSala.updateMany({ where: { id, inicioRealAt: null }, data: { inicioRealAt: inicio } });
  if (!fin) {
    await tx.instanciaSala.updateMany({
      where: { id, estado: "PROGRAMADA" },
      data: { estado: "EN_CURSO" }
    });
    return;
  }
  await tx.instanciaSala.updateMany({ where: { id, finRealAt: null }, data: { finRealAt: fin } });
  await tx.instanciaSala.updateMany({
    where: { id, estado: { in: ["PROGRAMADA", "EN_CURSO"] } },
    data: { estado: "FINALIZADA" }
  });
}
