import type { LeaseArchivoZoom } from "../domain";

export type DepsColaZoom = Readonly<{
  reclamarArchivo: (ahora: Date, duracionMs: number) => Promise<LeaseArchivoZoom | null>;
  procesar: (lease: LeaseArchivoZoom) => Promise<unknown>;
  ahora: () => Date;
  /** Estrategia de espera inyectable; debe resolver antes si se aborta la señal. */
  esperar: (ms: number, signal: AbortSignal) => Promise<void>;
  leaseMs: number;
  esperaVaciaMs: number;
}>;

/**
 * N carriles que reclaman y procesan archivos hasta que se aborta la señal (o, con `unaVez`,
 * hasta que la cola queda vacía). Tras una señal de apagado no se reclama nada más; el trabajo
 * en curso lo cierra `procesar`.
 */
export async function procesarColaZoomUseCase(
  deps: DepsColaZoom,
  opciones: Readonly<{ signal: AbortSignal; concurrencia: number; unaVez?: boolean }>
): Promise<void> {
  const carril = async (): Promise<void> => {
    while (!opciones.signal.aborted) {
      const lease = await deps.reclamarArchivo(deps.ahora(), deps.leaseMs);
      if (lease) {
        await deps.procesar(lease);
        continue;
      }
      if (opciones.unaVez) return;
      await deps.esperar(deps.esperaVaciaMs, opciones.signal);
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, Math.trunc(opciones.concurrencia)) }, carril));
}
