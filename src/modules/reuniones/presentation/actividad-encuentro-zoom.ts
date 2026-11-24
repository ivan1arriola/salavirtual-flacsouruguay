import { etiquetaEventoZoom } from "../../../integrations/zoom/zoom-eventos-catalogo";

/** Hecho confirmado por un aviso de Zoom, ya asociado a una ejecución por cuenta + UUID. */
export type HechoZoom = Readonly<{
  tipo: string;
  ocurridoAt: Date;
  huella?: string;
  participanteId?: string | null;
  detalle?: string | null;
}>;

export type EntradaActividadZoom = Readonly<{
  /** Tipo del primer hecho del grupo. */
  tipo: string;
  etiqueta: string;
  desde: Date;
  hasta: Date;
  /** Cantidad de avisos que resume (1 si no se agrupó). */
  cantidad: number;
  participanteId?: string | null;
  detalle?: string | null;
  huella?: string;
}>;

/** [singular, plural] */
const PLURALES: Record<string, readonly [string, string]> = {
  "meeting.participant_joined": ["entrada de participante", "entradas de participantes"],
  "meeting.participant_left": ["salida de participante", "salidas de participantes"],
  "meeting.participant_joined_waiting_room": ["ingreso a la sala de espera", "ingresos a la sala de espera"],
  "meeting.participant_left_waiting_room": ["salida de la sala de espera", "salidas de la sala de espera"],
  "meeting.participant_admitted": ["participante admitido", "participantes admitidos"],
  "meeting.participant_put_in_waiting_room": [
    "participante enviado a la sala de espera",
    "participantes enviados a la sala de espera"
  ]
};
/** Eventos que se resumen cuando son consecutivos del mismo tipo; el resto son hitos individuales. */
const AGRUPABLES = new Set(Object.keys(PLURALES));
const VENTANA_AGRUPACION_MS = 10 * 60_000;

/**
 * Ordena por hora real del aviso (no por orden de llegada: pueden llegar tarde o repetidos), descarta
 * duplicados exactos y resume entradas/salidas consecutivas. Solo muestra lo que Zoom informó.
 */
export function construirActividadEncuentroZoom(hechos: readonly HechoZoom[]): EntradaActividadZoom[] {
  const vistos = new Set<string>();
  const ordenados = [...hechos]
    .sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime())
    .filter(({ tipo, ocurridoAt, huella }) => {
      const clave = huella ?? `${tipo}|${ocurridoAt.getTime()}`;
      if (vistos.has(clave) && (huella !== undefined || !AGRUPABLES.has(tipo))) {
        return false;
      }
      vistos.add(clave);
      return true;
    });
  const entradas: {
    tipo: string;
    desde: Date;
    hasta: Date;
    cantidad: number;
    participanteId?: string | null;
    detalle?: string | null;
    huella?: string;
  }[] = [];
  for (const { tipo, ocurridoAt, participanteId, detalle, huella } of ordenados) {
    const ultima = entradas.at(-1);
    if (
      ultima &&
      AGRUPABLES.has(tipo) &&
      !participanteId &&
      !detalle &&
      !ultima.participanteId &&
      !ultima.detalle &&
      ultima.tipo === tipo &&
      ocurridoAt.getTime() - ultima.desde.getTime() <= VENTANA_AGRUPACION_MS
    ) {
      ultima.hasta = ocurridoAt;
      ultima.cantidad++;
    } else {
      entradas.push({ tipo, desde: ocurridoAt, hasta: ocurridoAt, cantidad: 1, participanteId, detalle, huella });
    }
  }
  return entradas.map((entrada) => ({ ...entrada, etiqueta: etiquetaEntrada(entrada) }));
}

function etiquetaEntrada(entrada: Readonly<{ tipo: string; cantidad: number }>): string {
  const formas = PLURALES[entrada.tipo];
  if (formas) {
    return `${entrada.cantidad} ${formas[entrada.cantidad === 1 ? 0 : 1]}`;
  }
  return etiquetaEventoZoom(entrada.tipo);
}
