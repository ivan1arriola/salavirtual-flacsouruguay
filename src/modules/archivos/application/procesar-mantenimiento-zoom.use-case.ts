export type TareaMantenimientoZoom = Readonly<{
  nombre: string;
  ejecutar: (signal: AbortSignal) => Promise<unknown>;
}>;

export type DepsMantenimientoZoom = Readonly<{
  tareas: readonly TareaMantenimientoZoom[];
  esperar: (ms: number, signal: AbortSignal) => Promise<void>;
  intervaloMs: number;
  /** Se invoca con el nombre de la tarea que falló; la excepción nunca detiene el ciclo. */
  alFallar?: (nombre: string, error: unknown) => void;
}>;

/**
 * Ciclo de mantenimiento (inventario reciente, histórico, reintentos, asistencia) que corre aparte
 * de los carriles de transferencia: un archivo enorme en curso nunca lo bloquea. Las tareas se
 * ejecutan en orden fijo para que ninguna se muera de hambre y cada fallo queda aislado.
 */
export async function procesarMantenimientoZoomUseCase(
  deps: DepsMantenimientoZoom,
  opciones: Readonly<{ signal: AbortSignal }>,
): Promise<void> {
  while (!opciones.signal.aborted) {
    for (const tarea of deps.tareas) {
      if (opciones.signal.aborted) {
        return;
      }
      try {
        await tarea.ejecutar(opciones.signal);
      } catch (error) {
        deps.alFallar?.(tarea.nombre, error);
      }
    }
    if (opciones.signal.aborted) {
      return;
    }
    await deps.esperar(deps.intervaloMs, opciones.signal);
  }
}
