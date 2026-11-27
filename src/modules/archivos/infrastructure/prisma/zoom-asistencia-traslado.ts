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
 * shortcut: con colisiones los minutos se recalculan en el reintento de asistencia (queda PENDIENTE), no aquí.
 */
export async function trasladarAsistenciaAlEncuentro(
  tx: Prisma.TransactionClient,
  ocurrenciaId: string,
  eventoProveedorId: string,
): Promise<void> {
  const destino = `evento:${eventoProveedorId}`;
  // Mismo bloqueo por ámbito que la sincronización de asistencia: si una sincronización está guardando bajo
  // la ocurrencia, el traslado espera y ve sus filas; si llega después, ya relee la ocurrencia vinculada.
  // Orden fijo (origen, destino) para no provocar interbloqueos entre vínculos.
  for (const ambito of [`ocurrencia:${ocurrenciaId}`, destino]) {
    const clave = "zoom-asistencia:" + ambito;
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${clave}, 0))`;
  }
  const [origen, existentes] = await Promise.all([
    tx.registroAsistenciaZoom.findMany({ where: { claveAmbito: `ocurrencia:${ocurrenciaId}` } }),
    tx.registroAsistenciaZoom.findMany({ where: { claveAmbito: destino } }),
  ]);
  const porClave = new Map(existentes.map((e) => [e.claveParticipante, e]));
  const libres = origen.filter((r) => !porClave.has(r.claveParticipante)).map((r) => r.id);
  if (libres.length > 0) {
    await tx.registroAsistenciaZoom.updateMany({
      where: { id: { in: libres } },
      data: { claveAmbito: destino, eventoProveedorId },
    });
  }
  let fusionados = 0;
  for (const previo of origen.filter((r) => porClave.has(r.claveParticipante))) {
    const actual = porClave.get(previo.claveParticipante)!;
    fusionados++;
    // Condicional por versión: si una persona editó la fila tras leerla, no se borra ni se pisa; se conserva visible.
    const conservarPrevia = () =>
      tx.registroAsistenciaZoom.updateMany({
        where: { id: previo.id },
        data: {
          claveAmbito: destino,
          eventoProveedorId,
          claveParticipante: `${previo.claveParticipante}#previo-${previo.id}`,
        },
      });
    if (!conDecisiones(previo)) {
      const { count } = await tx.registroAsistenciaZoom.deleteMany({
        where: {
          id: previo.id,
          version: previo.version,
          estadoConciliacion: "SIN_CONCILIAR",
          notasOperador: null,
        },
      });
      if (count === 0) {
        await conservarPrevia();
      }
    } else if (!conDecisiones(actual)) {
      const { count } = await tx.registroAsistenciaZoom.updateMany({
        where: { id: actual.id, version: actual.version },
        data: {
          estadoConciliacion: previo.estadoConciliacion,
          invitadoReunionId: previo.invitadoReunionId,
          esExterno: previo.esExterno,
          notasOperador: previo.notasOperador,
          version: { increment: 1 },
        },
      });
      if (count === 1) {
        await tx.registroAsistenciaZoom.deleteMany({
          where: { id: previo.id, version: previo.version },
        });
      } else {
        await conservarPrevia();
      }
    } else {
      await conservarPrevia();
    }
  }
  // Los minutos y porcentajes del encuentro no incluyen aún lo de esta ocurrencia: se marca el recálculo
  // pendiente para que la ficha no lo presente como actualizado y el reintento de asistencia lo consolide.
  if (fusionados > 0) {
    await tx.ocurrenciaArchivoZoom.updateMany({
      where: { id: ocurrenciaId },
      data: { estadoAsistencia: "PENDIENTE" },
    });
  }
}
