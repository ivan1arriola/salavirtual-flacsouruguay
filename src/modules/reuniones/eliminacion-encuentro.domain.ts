export type PlanEliminacionEncuentro = Readonly<{
  /** ENCUENTRO: se borra la fila del encuentro. SOLICITUD: se cancela su solicitud, que tiene un solo encuentro. */
  modo: "ENCUENTRO" | "SOLICITUD" | null;
  habilitado: boolean;
  motivo?: string;
}>;

/**
 * Cómo se elimina un encuentro desde el detalle. Un encuentro que es el único de su solicitud no puede
 * borrarse como fila (la solicitud quedaría vacía), pero en las series antiguas de Meet cada encuentro
 * es su propia solicitud: ahí se cancela esa solicitud, sin tocar el resto de la serie.
 */
export function planEliminacionEncuentro(
  entrada: Readonly<{
    editable: boolean;
    ocupado: boolean;
    encuentrosEnSolicitud: number;
    encuentrosEnPagina: number;
  }>,
): PlanEliminacionEncuentro {
  const unico = entrada.encuentrosEnSolicitud <= 1;
  if (unico && entrada.encuentrosEnPagina <= 1) {
    return {
      modo: null,
      habilitado: false,
      motivo: "Es el único encuentro de la reunión: usá Eliminar serie.",
    };
  }
  const modo = unico ? "SOLICITUD" : "ENCUENTRO";
  if (!entrada.editable) {
    return {
      modo,
      habilitado: false,
      motivo: "Solo se pueden eliminar encuentros programados que no empezaron.",
    };
  }
  if (entrada.ocupado) {
    return { modo, habilitado: false, motivo: "Hay otra operación en curso." };
  }
  return { modo, habilitado: true };
}
