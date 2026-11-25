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

export type ResumenActividadEncuentroZoom = Readonly<{
  entradas: number;
  salidas: number;
  admisiones: number;
  esperaAnfitrion: number;
  cambiosRol: number;
  movimientosGrupos: number;
  alertasCalidad: number;
  eventosGrabacion: number;
  comparticiones: number;
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
  ],
  "meeting.participant_jbh_waiting": [
    "participante esperando al anfitrión",
    "participantes esperando al anfitrión"
  ],
  "meeting.participant_jbh_waiting_left": [
    "participante abandonó la espera del anfitrión",
    "participantes abandonaron la espera del anfitrión"
  ],
  "meeting.participant_joined_breakout_room": [
    "entrada a grupo pequeño",
    "entradas a grupos pequeños"
  ],
  "meeting.participant_left_breakout_room": [
    "salida de grupo pequeño",
    "salidas de grupos pequeños"
  ]
};

/** Eventos que se resumen cuando son consecutivos del mismo tipo y participante. */
const AGRUPABLES = new Set(Object.keys(PLURALES));
const VENTANA_AGRUPACION_MS = 10 * 60_000;
const TIPOS_GRABACION = new Set([
  "recording.started",
  "recording.stopped",
  "recording.paused",
  "recording.resumed",
  "recording.completed",
  "recording.transcript_completed"
]);

/**
 * Ordena por hora real del aviso (no por orden de llegada: pueden llegar tarde o repetidos), descarta
 * duplicados exactos y resume eventos repetidos. Los ids solo sirven para correlacionar eventos; no
 * se presentan como identidad de una persona.
 */
export function construirActividadEncuentroZoom(hechos: readonly HechoZoom[]): EntradaActividadZoom[] {
  const vistos = new Set<string>();
  const ordenados = [...hechos]
    .sort((a, b) => a.ocurridoAt.getTime() - b.ocurridoAt.getTime())
    .filter(({ tipo, ocurridoAt, huella }) => {
      const clave = huella ?? tipo + "|" + ocurridoAt.getTime();
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
    const mismoParticipante = ultima?.participanteId === participanteId;
    if (
      ultima &&
      AGRUPABLES.has(tipo) &&
      ultima.tipo === tipo &&
      mismoParticipante &&
      (ultima.detalle ?? null) === (detalle ?? null) &&
      ocurridoAt.getTime() - ultima.hasta.getTime() <= VENTANA_AGRUPACION_MS
    ) {
      ultima.hasta = ocurridoAt;
      ultima.cantidad++;
    } else {
      entradas.push({
        tipo,
        desde: ocurridoAt,
        hasta: ocurridoAt,
        cantidad: 1,
        participanteId,
        detalle,
        huella
      });
    }
  }
  return entradas.map((entrada) => ({ ...entrada, etiqueta: etiquetaEntrada(entrada) }));
}

/** Separa la cronología de operación de eventos administrativos como las inscripciones. */
export function esActividadOperativaZoom(tipo: string): boolean {
  return (
    tipo === "meeting.started" ||
    tipo === "meeting.ended" ||
    tipo === "meeting.alert" ||
    tipo.startsWith("meeting.participant_") ||
    tipo.startsWith("meeting.sharing_") ||
    tipo.startsWith("meeting.breakout_room_") ||
    TIPOS_GRABACION.has(tipo)
  );
}

export function resumirActividadEncuentroZoom(
  actividad: readonly EntradaActividadZoom[]
): ResumenActividadEncuentroZoom {
  const contar = (tipos: readonly string[]) => {
    const conjunto = new Set(tipos);
    return actividad.reduce((total, entrada) => total + (conjunto.has(entrada.tipo) ? entrada.cantidad : 0), 0);
  };

  return {
    entradas: contar(["meeting.participant_joined"]),
    salidas: contar([
      "meeting.participant_left",
      "meeting.participant_left_waiting_room",
      "meeting.participant_jbh_waiting_left"
    ]),
    admisiones: contar(["meeting.participant_admitted"]),
    esperaAnfitrion: contar([
      "meeting.participant_jbh_waiting",
      "meeting.participant_joined_waiting_room"
    ]),
    cambiosRol: contar(["meeting.participant_role_changed"]),
    movimientosGrupos: contar([
      "meeting.participant_joined_breakout_room",
      "meeting.participant_left_breakout_room"
    ]),
    alertasCalidad: contar(["meeting.alert"]),
    eventosGrabacion: contar([...TIPOS_GRABACION]),
    comparticiones: contar(["meeting.sharing_started", "meeting.sharing_ended"])
  };
}

export function traducirDetalleActividadZoom(detalle: string | null | undefined): string | null {
  if (!detalle) return null;
  const traducciones: Record<string, string> = {
    "Unstable audio quality": "Audio inestable",
    "Unstable video quality": "Vídeo inestable",
    "Unstable screen share quality": "Compartir pantalla inestable",
    "High CPU occupation": "Uso elevado de CPU",
    "Call Reconnection": "Problemas de reconexión",
    application: "Aplicación",
    whiteboard: "Pizarra",
    desktop: "Escritorio",
    airplay: "AirPlay",
    camera: "Cámara",
    unknown: "Contenido no identificado",
    "Contenido: application": "Compartió una aplicación",
    "Contenido: whiteboard": "Compartió una pizarra",
    "Contenido: desktop": "Compartió el escritorio",
    "Contenido: airplay": "Compartió mediante AirPlay",
    "Contenido: camera": "Compartió una cámara",
    "Contenido: unknown": "Compartió contenido no identificado"
  };
  return detalle
    .split(",")
    .map((parte) => parte.trim())
    .filter(Boolean)
    .map((parte) => traducciones[parte] ?? parte)
    .join(" · ");
}

function etiquetaEntrada(entrada: Readonly<{ tipo: string; cantidad: number }>): string {
  const formas = PLURALES[entrada.tipo];
  if (formas) {
    return entrada.cantidad + " " + formas[entrada.cantidad === 1 ? 0 : 1];
  }
  return etiquetaEventoZoom(entrada.tipo);
}
