export type VentanaZoom = Readonly<{
  /** Fecha inclusiva YYYY-MM-DD. */
  desde: string;
  /** Fecha inclusiva YYYY-MM-DD. */
  hasta: string;
  /** true consulta la papelera de Zoom (grabaciones eliminadas) en vez de las activas. */
  papelera?: boolean;
}>;

/** Zoom limita cada consulta de grabaciones a 30 dias. */
export const DIAS_MAXIMOS_VENTANA_ZOOM = 30;

/**
 * Los listados de grabaciones se consultan con +-1 dia (UTC vs Montevideo): una ventana de 28 dias
 * produce un rango enviado a Zoom de a lo sumo 30. El limite real de Zoom (1 mes) debe confirmarse
 * empiricamente antes de produccion.
 */
export const DIAS_VENTANA_LISTADO_GRABACIONES = DIAS_MAXIMOS_VENTANA_ZOOM - 2;

const MS_POR_DIA = 86_400_000;

function parsearFechaZoom(valor: string): number {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const ms = coincide
    ? Date.UTC(Number(coincide[1]), Number(coincide[2]) - 1, Number(coincide[3]))
    : Number.NaN;
  if (!Number.isFinite(ms) || new Date(ms).toISOString().slice(0, 10) !== valor) {
    throw new RangeError(`Fecha invalida: ${valor}`);
  }
  return ms;
}

function formatearFechaZoom(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Divide [desde, hasta] (ambos inclusivos) en ventanas consecutivas de a lo sumo
 * 30 dias, sin huecos ni solapes. Usa aritmetica UTC para evitar desvios horarios.
 */
export function particionarPeriodoZoom(
  desde: string,
  hasta: string,
  diasVentana: number = DIAS_MAXIMOS_VENTANA_ZOOM,
): readonly VentanaZoom[] {
  if (!Number.isInteger(diasVentana) || diasVentana < 1) {
    throw new RangeError(`Tamano de ventana invalido: ${diasVentana}`);
  }
  const inicioMs = parsearFechaZoom(desde);
  const finMs = parsearFechaZoom(hasta);
  if (inicioMs > finMs) {
    throw new RangeError(`Periodo invertido: ${desde} > ${hasta}`);
  }
  const totalDias = Math.round((finMs - inicioMs) / MS_POR_DIA) + 1;
  const cantidad = Math.ceil(totalDias / diasVentana);
  return Array.from({ length: cantidad }, (_, i) => {
    const ventanaInicio = inicioMs + i * diasVentana * MS_POR_DIA;
    const ventanaFin = Math.min(ventanaInicio + (diasVentana - 1) * MS_POR_DIA, finMs);
    return { desde: formatearFechaZoom(ventanaInicio), hasta: formatearFechaZoom(ventanaFin) };
  });
}
