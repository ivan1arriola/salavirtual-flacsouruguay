/**
 * La creación de una reunión Zoom compartida por serie está detrás de la bandera
 * `ZOOM_REUNION_COMPARTIDA` (apagada por defecto). Se enciende solo después de desplegar y
 * sin versiones anteriores del worker en ejecución: una versión vieja no debe procesar un
 * `CANCELAR` sobre un evento con reunión compartida.
 */
export function reunionCompartidaHabilitada(
  env: Readonly<Record<string, string | undefined>>
): boolean {
  const valor = env.ZOOM_REUNION_COMPARTIDA;
  return valor === "1" || valor === "true";
}

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
