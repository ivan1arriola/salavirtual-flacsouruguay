/**
 * Backfill de las marcas oficiales de ejecución de Zoom (meeting.started/ended) en InstanciaSala.
 *   npm run zoom:backfill-ejecucion:dry   # por defecto: solo cuenta, no escribe
 *   npm run zoom:backfill-ejecucion       # --aplicar: escribe (idempotente, sin llamadas a Zoom)
 */
import type { PrismaClient } from "@prisma/client";
import { aplicarEjecucionZoomAInstancia } from "../src/modules/archivos/infrastructure/prisma/zoom-ejecucion-instancia";

export async function backfillEjecucionZoom(
  db: Pick<PrismaClient, "ocurrenciaArchivoZoom" | "$transaction">,
  aplicar: boolean
): Promise<{ candidatas: number; aplicadas: number }> {
  const candidatas = await db.ocurrenciaArchivoZoom.findMany({
    where: {
      eventoProveedorId: { not: null },
      eventoProveedor: {
        instancia: { OR: [{ inicioRealAt: null }, { finRealAt: null }, { estado: "PROGRAMADA" }] }
      }
    },
    select: { cuentaZoomId: true, uuid: true, eventoProveedor: { select: { instanciaSalaId: true } } }
  });
  let aplicadas = 0;
  for (const { cuentaZoomId, uuid, eventoProveedor } of candidatas) {
    if (!aplicar || !eventoProveedor) {
      continue;
    }
    const instanciaSalaId = eventoProveedor.instanciaSalaId;
    await db.$transaction((tx) => aplicarEjecucionZoomAInstancia(tx, { instanciaSalaId, cuentaZoomId, uuid }));
    aplicadas++;
  }
  return { candidatas: candidatas.length, aplicadas };
}

// shortcut: se ejecuta solo si es el punto de entrada, para poder importarlo en pruebas.
if (process.argv[1]?.includes("backfill-ejecucion-zoom")) {
  const aplicar = process.argv.includes("--aplicar");
  void (async () => {
    const { db } = await import("../src/lib/db");
    try {
      const resumen = await backfillEjecucionZoom(db, aplicar);
      console.log(JSON.stringify(resumen));
      if (!aplicar) {
        console.log("Dry-run: no se escribió nada. Ejecutar con --aplicar para escribir.");
      }
    } catch (error) {
      console.error(error instanceof Error ? error.message : "fallo desconocido");
      process.exitCode = 1;
    } finally {
      await db.$disconnect();
    }
  })();
}
