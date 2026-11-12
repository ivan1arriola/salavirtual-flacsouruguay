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
    throw new RangeError(
      "La ventana de asistencia debe tener inicio y fin válidos, con fin posterior al inicio."
    );
  }
}

function sesionValida(s: SesionObservadaZoom): boolean {
  return esFecha(s.entradaAt) && esFecha(s.salidaAt) && s.salidaAt.getTime() > s.entradaAt.getTime();
}

type Intervalo = readonly [number, number];

/** Orden estable sin mutar la entrada: `comparar` < 0 coloca `a` antes que `b`. */
function ordenar<T>(items: readonly T[], comparar: (a: T, b: T) => number): readonly T[] {
  return items.reduce<readonly T[]>((orden, actual) => {
    const indice = orden.findIndex((item) => comparar(actual, item) < 0);
    return indice < 0 ? [...orden, actual] : [...orden.slice(0, indice), actual, ...orden.slice(indice)];
  }, []);
}

function unirIntervalos(intervalos: readonly Intervalo[]): readonly Intervalo[] {
  return ordenar(intervalos, (a, b) => a[0] - b[0] || a[1] - b[1]).reduce<readonly Intervalo[]>(
    (acc, [ini, fin]) => {
      const ultimo = acc[acc.length - 1];
      return ultimo && ini <= ultimo[1]
        ? [...acc.slice(0, -1), [ultimo[0], Math.max(ultimo[1], fin)] as Intervalo]
        : [...acc, [ini, fin] as Intervalo];
    },
    []
  );
}

const duracion = (intervalos: readonly Intervalo[]) => intervalos.reduce((suma, [a, b]) => suma + (b - a), 0);
const redondear2 = (valor: number) => Math.round(valor * 100) / 100;

type Observacion = Readonly<{ sesion: SesionObservadaZoom; ventana: VentanaAsistenciaZoom }>;

function clavePersona(s: SesionObservadaZoom): string {
  return s.participanteId ? `id:${s.participanteId}` : `sesion:${s.claveSesion}`;
}

function consolidar(
  grupos: ReadonlyArray<
    Readonly<{ sesiones: readonly SesionObservadaZoom[]; ventana: VentanaAsistenciaZoom }>
  >
): readonly AsistenciaZoomConsolidada[] {
  const ventanas = grupos.map((g): Intervalo => {
    validarVentana(g.ventana);
    return [g.ventana.inicioAt.getTime(), g.ventana.finAt.getTime()];
  });
  const total = duracion(unirIntervalos(ventanas));

  const observaciones = grupos.flatMap(({ sesiones, ventana }) =>
    sesiones.filter(sesionValida).map((sesion): Observacion => ({ sesion, ventana }))
  );
  // Agrupa conservando el orden de aparición: Object conserva el orden de inserción de claves de texto.
  const porPersona = observaciones.reduce<Readonly<Record<string, readonly Observacion[]>>>((acc, o) => {
    const clave = clavePersona(o.sesion);
    return { ...acc, [clave]: [...(acc[clave] ?? []), o] };
  }, {});

  const consolidadas = Object.entries(porPersona).map(
    ([claveParticipante, items]): AsistenciaZoomConsolidada => {
      // Sala de espera: solo traza. No cuenta minutos ni la primera entrada.
      const enReunion = items.filter(({ sesion }) => sesion.status !== "in_waiting_room");
      const intervalos = enReunion.flatMap(({ sesion, ventana }): readonly Intervalo[] => {
        const desde = Math.max(sesion.entradaAt.getTime(), ventana.inicioAt.getTime());
        const hasta = Math.min(sesion.salidaAt.getTime(), ventana.finAt.getTime());
        return hasta > desde ? [[desde, hasta]] : [];
      });
      const ms = duracion(unirIntervalos(intervalos));
      const entradas = enReunion.map(({ sesion }) => sesion.entradaAt.getTime());
      const salidas = enReunion.map(({ sesion }) => sesion.salidaAt.getTime());
      return {
        claveParticipante,
        nombre: items[0]!.sesion.nombre,
        emailObservado: items.map(({ sesion }) => sesion.email).find((e): e is string => !!e) ?? null,
        minutos: redondear2(ms / MS_MINUTO),
        porcentaje: total > 0 ? Math.min(100, redondear2((ms / total) * 100)) : 0,
        sesiones: items.length,
        primeraEntradaAt: entradas.length ? new Date(Math.min(...entradas)) : null,
        ultimaSalidaAt: salidas.length ? new Date(Math.max(...salidas)) : null,
        esHostOCohost: items.some(({ sesion }) => sesion.rol === "HOST" || sesion.rol === "COHOST"),
        claveSesiones: items.map(({ sesion }) => sesion.claveSesion),
        estadoConciliacion: "SIN_CONCILIAR"
      };
    }
  );
  return ordenar(
    consolidadas,
    (a, b) =>
      (a.primeraEntradaAt?.getTime() ?? Infinity) - (b.primeraEntradaAt?.getTime() ?? Infinity) ||
      a.nombre.localeCompare(b.nombre) ||
      a.claveParticipante.localeCompare(b.claveParticipante)
  );
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
  ocurrencias: ReadonlyArray<
    Readonly<{ sesiones: readonly SesionObservadaZoom[]; ventana: VentanaAsistenciaZoom }>
  >
): readonly AsistenciaZoomConsolidada[] {
  return consolidar(ocurrencias);
}

export type ResumenAsistenciaZoom = Readonly<{
  participantes: number;
  estudiantes: number;
  anfitriones: number;
}>;

/** Conteo sin veredicto: los hosts/cohosts con rol comprobado no cuentan como estudiantes. */
export function resumirAsistenciaZoom(
  asistencia: readonly AsistenciaZoomConsolidada[]
): ResumenAsistenciaZoom {
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
      "zoom-sesion",
      ocurrenciaUuid,
      sesion.participanteId ?? "",
      sesion.userId ?? "",
      sesion.nombre,
      esFecha(sesion.entradaAt) ? sesion.entradaAt.toISOString() : "?",
      esFecha(sesion.salidaAt) ? sesion.salidaAt.toISOString() : "?"
    ].join("|")
  );
}
