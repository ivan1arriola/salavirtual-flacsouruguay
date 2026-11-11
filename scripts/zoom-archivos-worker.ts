/**
 * Worker dedicado de conservación de archivos Zoom (proceso aparte de Next).
 *   npm run zoom:archivos:worker           # servicio continuo
 *   npm run zoom:archivos:worker -- --once # un ciclo de mantenimiento y vaciar la cola
 * SIGTERM/SIGINT: deja de reclamar, aborta E/S en curso y sale ordenadamente.
 */
import { setTimeout as dormir } from "node:timers/promises";
import { crearWorkerZoomArchivos } from "../src/bootstrap/zoom-archivos.server";
import { db } from "../src/lib/db";
import { procesarColaZoomUseCase, procesarMantenimientoZoomUseCase } from "../src/modules/archivos/application";

const unaVez = process.argv.includes("--once");

function log(nivel: "info" | "warn" | "error", mensaje: string, extra: Record<string, unknown> = {}): void {
  // Solo códigos y contadores: nunca URLs, tokens ni cuerpos de respuesta.
  console.log(JSON.stringify({ t: new Date().toISOString(), nivel, mensaje, ...extra }));
}

async function esperar(ms: number, signal: AbortSignal): Promise<void> {
  try {
    await dormir(ms, undefined, { signal });
  } catch {
    // Abortada: el llamador comprueba la señal.
  }
}

async function main(): Promise<number> {
  const control = new AbortController();
  const apagar = (senal: string) => () => {
    log("info", "apagado solicitado", { senal });
    control.abort();
  };
  process.once("SIGTERM", apagar("SIGTERM"));
  process.once("SIGINT", apagar("SIGINT"));

  const worker = await crearWorkerZoomArchivos();
  for (const aviso of worker.salud.avisos ?? []) log("warn", aviso);
  if (!worker.salud.ok) {
    log("error", "el worker no puede arrancar", { motivos: worker.salud.motivos });
    return 1;
  }
  const { config } = worker;
  log("info", "worker iniciado", { unaVez, concurrencia: config.concurrencia });

  const mantenimiento = procesarMantenimientoZoomUseCase(
    {
      tareas: [
        { nombre: "inventario-vencidas", ejecutar: async () => log("info", "inventario", { resumen: await worker.inventariarVencidas() }) },
        { nombre: "recuperacion-historica", ejecutar: async () => log("info", "recuperación", { resumen: await worker.procesarRecuperaciones() }) },
        { nombre: "barrido-recientes", ejecutar: async () => log("info", "barrido", { resumen: await worker.barrerRecientes() }) }
      ],
      esperar,
      intervaloMs: config.intervaloMantenimientoMs,
      alFallar: (nombre, error) => log("error", "tarea de mantenimiento falló", { tarea: nombre, error: error instanceof Error ? error.name : "desconocido" })
    },
    { signal: control.signal }
  );

  const cola = procesarColaZoomUseCase(
    {
      reclamarArchivo: worker.reclamarArchivo,
      procesar: async (lease) => {
        const r = await worker.transferir(lease, control.signal);
        log("info", "archivo procesado", { archivoId: lease.archivoId, resultado: (r as { tipo?: string } | undefined)?.tipo ?? "n/d" });
      },
      ahora: () => new Date(),
      esperar,
      leaseMs: config.leaseMs,
      esperaVaciaMs: config.esperaVaciaMs
    },
    { signal: control.signal, concurrencia: config.concurrencia, unaVez }
  );

  if (unaVez) {
    // Un ciclo de mantenimiento antes de vaciar la cola; luego se corta el bucle de mantenimiento.
    await esperar(0, control.signal);
    await cola;
    control.abort();
    await mantenimiento;
  } else {
    await Promise.all([mantenimiento, cola]);
  }
  log("info", "worker detenido");
  return 0;
}

main()
  .then(async (codigo) => {
    await db.$disconnect();
    process.exit(codigo);
  })
  .catch(async (error: unknown) => {
    log("error", "fallo fatal del worker", { error: error instanceof Error ? error.name : "desconocido" });
    await db.$disconnect().catch(() => undefined);
    process.exit(1);
  });
