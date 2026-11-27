export type EncuentroEnlaceSerie = Readonly<{
  instanciaId: string;
  inicio: Date;
  estado: string;
  /** Proveedor activo del encuentro (ver `proveedorActivoDeInstancia`). */
  proveedor: "GOOGLE_MEET" | "ZOOM";
  joinUrl: string | null;
  externalEventId: string | null;
  cuentaProveedorId: string | null;
  reunionProveedorId: string | null;
}>;

export type EvaluacionEnlacesSerie = Readonly<{
  /** Hay encuentros en Zoom y en Meet: se resuelve con la migración por serie, no con esta corrección. */
  mixta: boolean;
  /** Todos los encuentros apuntan a una misma reunión compartida. */
  unificada: boolean;
  enlacesDistintos: number;
  cuentasDistintas: number;
  /** Encuentros futuros en Zoom que la serie corregiría. */
  encuentrosZoom: number;
  /** La serie necesita corrección: más de un enlace o más de una cuenta, sin estar unificada ni mixta. */
  necesitaCorreccion: boolean;
  /**
   * Serie mixta cuyos encuentros en Zoom aún no comparten una reunión: hay que unificarlos (solo ellos)
   * antes de migrar los que siguen en Meet, para que toda la serie termine con un único enlace.
   */
  mixtaSinUnificar: boolean;
}>;

const distintos = (valores: readonly (string | null)[]): number =>
  new Set(valores.filter((valor): valor is string => Boolean(valor))).size;

/**
 * Evalúa si los encuentros futuros y programados de una serie comparten enlace y cuenta anfitriona.
 * Los cancelados y pasados no cuentan.
 */
export function evaluarEnlacesDeSerie(
  encuentros: readonly EncuentroEnlaceSerie[],
  ahora: Date,
): EvaluacionEnlacesSerie {
  const futuros = encuentros.filter(
    ({ estado, inicio }) => estado === "PROGRAMADA" && inicio > ahora,
  );
  const enZoom = futuros.filter(({ proveedor }) => proveedor === "ZOOM");
  const mixta = enZoom.length > 0 && enZoom.length < futuros.length;
  const reuniones = distintos(enZoom.map(({ reunionProveedorId }) => reunionProveedorId));
  const unificada =
    enZoom.length > 0 &&
    enZoom.every(({ reunionProveedorId }) => reunionProveedorId !== null) &&
    reuniones === 1;
  const enlacesDistintos = distintos(enZoom.map(({ joinUrl }) => joinUrl));
  const cuentasDistintas = distintos(enZoom.map(({ cuentaProveedorId }) => cuentaProveedorId));
  return {
    mixta,
    unificada,
    enlacesDistintos,
    cuentasDistintas,
    encuentrosZoom: enZoom.length,
    necesitaCorreccion:
      !mixta && !unificada && enZoom.length > 1 && (enlacesDistintos > 1 || cuentasDistintas > 1),
    mixtaSinUnificar: mixta && !unificada,
  };
}
