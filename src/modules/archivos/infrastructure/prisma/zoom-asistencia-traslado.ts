import type { Prisma } from "@prisma/client";

const conDecisiones = (r: {
  estadoConciliacion: string;
  invitadoReunionId: string | null;
  esExterno: boolean | null;
  notasOperador: string | null;
}) =>
  r.estadoConciliacion !== "SIN_CONCILIAR" ||
  r.invitadoReunionId !== null ||
  r.esExterno !== null ||
  r.notasOperador !== null;

/**
 * Una ocurrencia sin vínculo consolida bajo `ocurrencia:<id>`. Al vincularla (a mano o automáticamente) esos
 * registros pasan al ámbito del encuentro. Si la persona ya existe allí no se pierde ninguna decisión humana:
 * se copian al registro del encuentro si este no tiene las suyas, y si ambos las tienen la fila previa se
 * conserva visible en el encuentro con la clave marcada con "#previo" para revisión.
 * shortcut: minutos y porcentaje se recalculan en la próxima sincronización de asistencia, no aquí.
 */
export async function trasladarAsistenciaAlEncuentro(
  tx: Prisma.TransactionClient,
  ocurrenciaId: string,
  eventoProveedorId: string
): Promise<void> {
  const destino = `evento:${eventoProveedorId}`;
  const [origen, existentes] = await Promise.all([
    tx.registroAsistenciaZoom.findMany({ where: { claveAmbito: `ocurrencia:${ocurrenciaId}` } }),
    tx.registroAsistenciaZoom.findMany({ where: { claveAmbito: destino } })
  ]);
  const porClave = new Map(existentes.map((e) => [e.claveParticipante, e]));
  const libres = origen.filter((r) => !porClave.has(r.claveParticipante)).map((r) => r.id);
  if (libres.length > 0) {
    await tx.registroAsistenciaZoom.updateMany({
      where: { id: { in: libres } },
      data: { claveAmbito: destino, eventoProveedorId }
    });
  }
  for (const previo of origen.filter((r) => porClave.has(r.claveParticipante))) {
    const actual = porClave.get(previo.claveParticipante)!;
    if (!conDecisiones(previo)) {
      await tx.registroAsistenciaZoom.delete({ where: { id: previo.id } });
    } else if (!conDecisiones(actual)) {
      await tx.registroAsistenciaZoom.update({
        where: { id: actual.id },
        data: {
          estadoConciliacion: previo.estadoConciliacion,
          invitadoReunionId: previo.invitadoReunionId,
          esExterno: previo.esExterno,
          notasOperador: previo.notasOperador,
          version: { increment: 1 }
        }
      });
      await tx.registroAsistenciaZoom.delete({ where: { id: previo.id } });
    } else {
      await tx.registroAsistenciaZoom.update({
        where: { id: previo.id },
        data: {
          claveAmbito: destino,
          eventoProveedorId,
          claveParticipante: `${previo.claveParticipante}#previo-${previo.id}`
        }
      });
    }
  }
}
