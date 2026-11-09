import type { HashZoom } from "./zoom-archivos.domain";

export type EstadoSesionZoom = "in_meeting" | "in_waiting_room";
/** Rol observado en Zoom; solo un rol comprobado excluye a alguien del conteo de estudiantes. */
export type RolObservadoZoom = "HOST" | "COHOST";

export type SesionObservadaZoom = Readonly<{
  /** Estable por ocurrencia: ver `claveSesionZoom`. */
  claveSesion: string;
  /** `id` informado por Zoom; solo si es fiable identifica a la persona entre reconexiones. */
  participanteId: string | null;
  /** `user_id` de Zoom: cambia con cada reconexión, nunca identifica a una persona. */
  userId: string | null;
  nombre: string;
  /** Correo informado por Zoom: observado, no identidad institucional confirmada. */
  email: string | null;
  entradaAt: Date;
  salidaAt: Date;
  status: EstadoSesionZoom | null;
  rol: RolObservadoZoom | null;
}>;

export type VentanaAsistenciaZoom = Readonly<{ inicioAt: Date; finAt: Date }>;

export type AsistenciaZoomConsolidada = Readonly<{
  /** `id:<participanteId>` si hay identificador fiable; si no `sesion:<claveSesion>` (sesión diferenciada). */
  claveParticipante: string;
  nombre: string;
  emailObservado: string | null;
  /** Minutos con 2 decimales dentro de la reunión, sin solapes y recortados al horario. */
  minutos: number;
  /** Sobre la ventana programada, 0–100 con 2 decimales. Sin umbral ni veredicto de cumplimiento. */
  porcentaje: number;
  /** Sesiones válidas observadas, incluidas las de sala de espera (traza). */
  sesiones: number;
  primeraEntradaAt: Date | null;
  ultimaSalidaAt: Date | null;
  esHostOCohost: boolean;
  claveSesiones: readonly string[];
  /** La consolidación automática nunca concilia: eso lo hace una persona autorizada. */
  estadoConciliacion: "SIN_CONCILIAR";
}>;

const MS_MINUTO = 60_000;

function esFecha(valor: Date): boolean {
  return valor instanceof Date && Number.isFinite(valor.getTime());
}

function validarVentana(v: VentanaAsistenciaZoom): void {
  if (!esFecha(v.inicioAt) || !esFecha(v.finAt) || v.finAt.getTime() <= v.inicioAt.getTime()) {
    throw new RangeError("La ventana de asistencia debe tener inicio y fin válidos, con fin posterior al inicio.");
  }
}

function sesionValida(s: SesionObservadaZoom): boolean {
  return esFecha(s.entradaAt) && esFecha(s.salidaAt) && s.salidaAt.getTime() > s.entradaAt.getTime();
}

type Intervalo = readonly [number, number];

function unirIntervalos(intervalos: readonly Intervalo[]): readonly Intervalo[] {
  const ordenados = [...intervalos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const salida: Array<[number, number]> = [];
  for (const [ini, fin] of ordenados) {
    const ultimo = salida[salida.length - 1];
    if (ultimo && ini <= ultimo[1]) ultimo[1] = Math.max(ultimo[1], fin);
    else salida.push([ini, fin]);
  }
  return salida;
}

const duracion = (intervalos: readonly Intervalo[]) => intervalos.reduce((s, [a, b]) => s + (b - a), 0);
const redondear2 = (valor: number) => Math.round(valor * 100) / 100;

type Acumulador = {
  clave: string;
  nombre: string;
  email: string | null;
  intervalos: Intervalo[];
  sesiones: number;
  entradas: number[];
  salidas: number[];
  host: boolean;
  claves: string[];
};

function clavePersona(s: SesionObservadaZoom): string {
  return s.participanteId ? `id:${s.participanteId}` : `sesion:${s.claveSesion}`;
}

function consolidar(
  grupos: ReadonlyArray<Readonly<{ sesiones: readonly SesionObservadaZoom[]; ventana: VentanaAsistenciaZoom }>>
): readonly AsistenciaZoomConsolidada[] {
  const ventanas: Intervalo[] = [];
  for (const g of grupos) {
    validarVentana(g.ventana);
    ventanas.push([g.ventana.inicioAt.getTime(), g.ventana.finAt.getTime()]);
  }
  const total = duracion(unirIntervalos(ventanas));

  const personas = new Map<string, Acumulador>();
  for (const { sesiones, ventana } of grupos) {
    const ini = ventana.inicioAt.getTime();
    const fin = ventana.finAt.getTime();
    for (const s of sesiones) {
      if (!sesionValida(s)) continue;
      const clave = clavePersona(s);
      const acc = personas.get(clave) ?? {
        clave, nombre: s.nombre, email: null, intervalos: [], sesiones: 0, entradas: [], salidas: [], host: false, claves: []
      };
      acc.sesiones += 1;
      acc.claves.push(s.claveSesion);
      if (acc.email === null && s.email) acc.email = s.email;
      if (s.rol === "HOST" || s.rol === "COHOST") acc.host = true;
      // Sala de espera: solo traza. No cuenta minutos ni la primera entrada.
      if (s.status !== "in_waiting_room") {
        const desde = Math.max(s.entradaAt.getTime(), ini);
        const hasta = Math.min(s.salidaAt.getTime(), fin);
        if (hasta > desde) acc.intervalos.push([desde, hasta]);
        acc.entradas.push(s.entradaAt.getTime());
        acc.salidas.push(s.salidaAt.getTime());
      }
      personas.set(clave, acc);
    }
  }

  return [...personas.values()]
    .map((acc): AsistenciaZoomConsolidada => {
      const ms = duracion(unirIntervalos(acc.intervalos));
      return {
        claveParticipante: acc.clave,
        nombre: acc.nombre,
        emailObservado: acc.email,
        minutos: redondear2(ms / MS_MINUTO),
        porcentaje: total > 0 ? Math.min(100, redondear2((ms / total) * 100)) : 0,
        sesiones: acc.sesiones,
        primeraEntradaAt: acc.entradas.length ? new Date(Math.min(...acc.entradas)) : null,
        ultimaSalidaAt: acc.salidas.length ? new Date(Math.max(...acc.salidas)) : null,
        esHostOCohost: acc.host,
        claveSesiones: acc.claves,
        estadoConciliacion: "SIN_CONCILIAR"
      };
    })
    .sort((a, b) => (a.primeraEntradaAt?.getTime() ?? Infinity) - (b.primeraEntradaAt?.getTime() ?? Infinity) || a.nombre.localeCompare(b.nombre) || a.claveParticipante.localeCompare(b.claveParticipante));
}

/** Consolida las sesiones de una ocurrencia sobre su horario programado. */
export function consolidarAsistenciaZoom(
  sesiones: readonly SesionObservadaZoom[],
  ventana: VentanaAsistenciaZoom
): readonly AsistenciaZoomConsolidada[] {
  return consolidar([{ sesiones, ventana }]);
}

/** Une las ocurrencias vinculadas a un encuentro, cada una recortada a su propio horario programado. */
export function consolidarAsistenciaOcurrenciasZoom(
  ocurrencias: ReadonlyArray<Readonly<{ sesiones: readonly SesionObservadaZoom[]; ventana: VentanaAsistenciaZoom }>>
): readonly AsistenciaZoomConsolidada[] {
  return consolidar(ocurrencias);
}

export type ResumenAsistenciaZoom = Readonly<{ participantes: number; estudiantes: number; anfitriones: number }>;

/** Conteo sin veredicto: los hosts/cohosts con rol comprobado no cuentan como estudiantes. */
export function resumirAsistenciaZoom(asistencia: readonly AsistenciaZoomConsolidada[]): ResumenAsistenciaZoom {
  const anfitriones = asistencia.filter((a) => a.esHostOCohost).length;
  return { participantes: asistencia.length, estudiantes: asistencia.length - anfitriones, anfitriones };
}

/** Clave estable de una sesión por ocurrencia: idempotente ante reintentos del mismo reporte. */
export function claveSesionZoom(
  hash: HashZoom,
  ocurrenciaUuid: string,
  sesion: Pick<SesionObservadaZoom, "participanteId" | "userId" | "nombre" | "entradaAt" | "salidaAt">
): string {
  return hash(
    [
      "zoom-sesion", ocurrenciaUuid, sesion.participanteId ?? "", sesion.userId ?? "", sesion.nombre,
      esFecha(sesion.entradaAt) ? sesion.entradaAt.toISOString() : "?",
      esFecha(sesion.salidaAt) ? sesion.salidaAt.toISOString() : "?"
    ].join("|")
  );
}
