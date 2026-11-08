export type VentanaZoom = Readonly<{
  /** Fecha inclusiva YYYY-MM-DD. */
  desde: string;
  /** Fecha inclusiva YYYY-MM-DD. */
  hasta: string;
}>;

/** Zoom limita cada consulta de grabaciones a 30 dias. */
export const DIAS_MAXIMOS_VENTANA_ZOOM = 30;

const MS_POR_DIA = 86_400_000;

function parsearFechaZoom(valor: string): number {
  const coincide = /^(\d{4})-(\d{2})-(\d{2})$/.exec(valor);
  const ms = coincide ? Date.UTC(Number(coincide[1]), Number(coincide[2]) - 1, Number(coincide[3])) : Number.NaN;
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
export function particionarPeriodoZoom(desde: string, hasta: string): readonly VentanaZoom[] {
  const inicioMs = parsearFechaZoom(desde);
  const finMs = parsearFechaZoom(hasta);
  if (inicioMs > finMs) {
    throw new RangeError(`Periodo invertido: ${desde} > ${hasta}`);
  }
  const totalDias = Math.round((finMs - inicioMs) / MS_POR_DIA) + 1;
  const cantidad = Math.ceil(totalDias / DIAS_MAXIMOS_VENTANA_ZOOM);
  return Array.from({ length: cantidad }, (_, i) => {
    const ventanaInicio = inicioMs + i * DIAS_MAXIMOS_VENTANA_ZOOM * MS_POR_DIA;
    const ventanaFin = Math.min(ventanaInicio + (DIAS_MAXIMOS_VENTANA_ZOOM - 1) * MS_POR_DIA, finMs);
    return { desde: formatearFechaZoom(ventanaInicio), hasta: formatearFechaZoom(ventanaFin) };
  });
}
