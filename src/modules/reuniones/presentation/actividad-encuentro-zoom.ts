/** Hecho confirmado por un aviso de Zoom, ya asociado a una ejecución por cuenta + UUID. */
export type HechoZoom = Readonly<{ tipo: string; ocurridoAt: Date }>;

export type EntradaActividadZoom = Readonly<{
  /** Tipo del primer hecho del grupo. */
  tipo: string;
  etiqueta: string;
  desde: Date;
  hasta: Date;
  /** Cantidad de avisos que resume (1 si no se agrupó). */
  cantidad: number;
}>;

const ETIQUETAS: Record<string, string> = {
  "meeting.started": "Reunión iniciada",
  "meeting.ended": "Reunión finalizada",
  "recording.started": "Grabación iniciada",
  "recording.stopped": "Grabación detenida",
  "recording.paused": "Grabación pausada",
  "recording.resumed": "Grabación reanudada",
  "recording.completed": "Grabación procesada por Zoom",
  "recording.transcript_completed": "Transcripción disponible",
  "meeting.sharing_started": "Pantalla compartida iniciada",
  "meeting.sharing_ended": "Pantalla compartida finalizada",
  "meeting.alert": "Alerta técnica informada por Zoom",
  "meeting.summary_completed": "Resumen de reunión disponible"
};
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
    .filter(({ tipo, ocurridoAt }) => {
      const clave = `${tipo}|${ocurridoAt.getTime()}`;
      if (vistos.has(clave) && !AGRUPABLES.has(tipo)) {
        return false;
      }
      vistos.add(clave);
      return true;
    });
  const entradas: { tipo: string; desde: Date; hasta: Date; cantidad: number }[] = [];
  for (const { tipo, ocurridoAt } of ordenados) {
    const ultima = entradas.at(-1);
    if (
      ultima &&
      AGRUPABLES.has(tipo) &&
      ultima.tipo === tipo &&
      ocurridoAt.getTime() - ultima.hasta.getTime() <= VENTANA_AGRUPACION_MS
    ) {
      ultima.hasta = ocurridoAt;
      ultima.cantidad++;
    } else {
      entradas.push({ tipo, desde: ocurridoAt, hasta: ocurridoAt, cantidad: 1 });
    }
  }
  return entradas.map((entrada) => ({ ...entrada, etiqueta: etiquetaEntrada(entrada) }));
}

function etiquetaEntrada(entrada: Readonly<{ tipo: string; cantidad: number }>): string {
  const formas = PLURALES[entrada.tipo];
  if (formas) {
    return `${entrada.cantidad} ${formas[entrada.cantidad === 1 ? 0 : 1]}`;
  }
  return ETIQUETAS[entrada.tipo] ?? "Otra actividad de Zoom";
}
