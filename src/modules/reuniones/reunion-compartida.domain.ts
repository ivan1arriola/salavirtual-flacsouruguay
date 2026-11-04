/**
 * Todos los encuentros de una serie en Zoom comparten una sola reunión (un enlace y una sala).
 * Es el único comportamiento: la antigua bandera `ZOOM_REUNION_COMPARTIDA` se retiró.
 */
export type UsoReunionCompartida = Readonly<{
  eventoProveedorId: string;
  instanciaEstado: string;
  instanciaFin: Date;
}>;

const ESTADOS_ACTIVOS = ["PROGRAMADA", "EN_CURSO"] as const;

/**
 * Encuentros que todavía usan la reunión compartida: programados o en curso y con el fin
 * en el futuro. Los cancelados y los ya terminados no la mantienen viva.
 */
export function usosActivos(
  usos: readonly UsoReunionCompartida[],
  ahora: Date,
  excluirEventoId?: string
): number {
  return usos.filter((uso) =>
    uso.eventoProveedorId !== excluirEventoId
    && (ESTADOS_ACTIVOS as readonly string[]).includes(uso.instanciaEstado)
    && uso.instanciaFin.getTime() > ahora.getTime()
  ).length;
}

/** La reunión Zoom se elimina solo cuando, descontado el evento que cancela, no queda ningún uso activo. */
export function debeEliminarseReunionCompartida(
  usos: readonly UsoReunionCompartida[],
  eventoQueCancela: string,
  ahora: Date
): boolean {
  return usosActivos(usos, ahora, eventoQueCancela) === 0;
}
