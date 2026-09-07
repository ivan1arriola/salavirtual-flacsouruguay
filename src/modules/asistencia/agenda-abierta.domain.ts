import {
  cumpleSeparacionMinimaAsistencias,
  SEPARACION_MINIMA_ASISTENCIAS_MINUTOS,
  type PeriodoAsistencia
} from "./asistencia.domain";

export type AsignacionExistente = Readonly<{
  id: string;
  titulo: string;
  inicio: Date;
  fin: Date;
}>;

export type ConflictoAsistenciaResultado =
  | {
      estado: "DISPONIBLE";
      etiqueta: "Disponible";
      tone: "green";
    }
  | {
      estado: "CONFLICTO";
      etiqueta: "Conflicto de horario";
      detalle: string;
      tone: "red";
      reunionConflicto: AsignacionExistente;
    }
  | {
      estado: "MUY_PROXIMO";
      etiqueta: "Muy próximo";
      detalle: string;
      minutosSeparacion: number;
      tone: "amber";
      reunionConflicto: AsignacionExistente;
    };

/**
 * Evalúa si una reunión candidata entra en conflicto con las coberturas ya asignadas al asistente.
 * Reutiliza las reglas de separación mínima (30 min) y solapamiento directo.
 */
export function evaluarConflictoAsistencia(
  candidata: PeriodoAsistencia,
  asignadas: readonly AsignacionExistente[]
): ConflictoAsistenciaResultado {
  const candStart = candidata.inicio.getTime();
  const candEnd = candidata.fin.getTime();

  // 1. Verificar solapamiento directo primero (conflicto estricto)
  const solapada = asignadas.find((asignada) => {
    const asigStart = asignada.inicio.getTime();
    const asigEnd = asignada.fin.getTime();
    return candStart < asigEnd && candEnd > asigStart;
  });

  if (solapada) {
    return {
      estado: "CONFLICTO",
      etiqueta: "Conflicto de horario",
      detalle: `Se superpone con: ${solapada.titulo}`,
      tone: "red",
      reunionConflicto: solapada
    };
  }

  // 2. Verificar separación mínima (muy próximo < 30 min)
  const proxima = asignadas.find((asignada) => !cumpleSeparacionMinimaAsistencias(candidata, asignada));

  if (proxima) {
    const asigStart = proxima.inicio.getTime();
    const asigEnd = proxima.fin.getTime();
    const minutos = candStart >= asigEnd
      ? Math.round((candStart - asigEnd) / 60_000)
      : Math.round((asigStart - candEnd) / 60_000);

    return {
      estado: "MUY_PROXIMO",
      etiqueta: "Muy próximo",
      detalle: `A ${minutos} min de: ${proxima.titulo} (mínimo ${SEPARACION_MINIMA_ASISTENCIAS_MINUTOS} min)`,
      minutosSeparacion: minutos,
      tone: "amber",
      reunionConflicto: proxima
    };
  }

  return {
    estado: "DISPONIBLE",
    etiqueta: "Disponible",
    tone: "green"
  };
}

function parseDateParts(date: Date, timezone: string): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return {
    year: Number(parts.find((p) => p.type === "year")?.value),
    month: Number(parts.find((p) => p.type === "month")?.value),
    day: Number(parts.find((p) => p.type === "day")?.value)
  };
}

/**
 * Devuelve una etiqueta amigable de tiempo relativo en días (ej. "Hoy", "Mañana", "En 3 días").
 */
export function formatearDiasRestantes(
  fecha: Date,
  ahora: Date,
  timezone = "America/Montevideo"
): string {
  const f = parseDateParts(fecha, timezone);
  const a = parseDateParts(ahora, timezone);

  const fUtc = Date.UTC(f.year, f.month - 1, f.day);
  const aUtc = Date.UTC(a.year, a.month - 1, a.day);
  const diffDays = Math.round((fUtc - aUtc) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Hoy";
  if (diffDays === 1) return "Mañana";
  if (diffDays === -1) return "Ayer";
  if (diffDays > 1) {
    if (diffDays >= 7 && diffDays < 14) return "En 1 semana";
    if (diffDays >= 14 && diffDays % 7 === 0) return `En ${diffDays / 7} semanas`;
    return `En ${diffDays} días`;
  }
  return `Hace ${Math.abs(diffDays)} días`;
}

/**
 * Agrupa una lista de elementos que tienen inicioProgramadoAt por fecha en la zona horaria indicada.
 */
export function agruparPorFecha<T extends { inicioProgramadoAt: Date }>(
  items: readonly T[],
  ahora: Date,
  timezone = "America/Montevideo"
): ReadonlyArray<{
  claveFecha: string;
  etiquetaFecha: string;
  etiquetaRelativa: string;
  items: readonly T[];
}> {
  const claves = [...new Set(items.map((item) => dateKey(item.inicioProgramadoAt, timezone)))];

  return claves.map((claveFecha) => {
    const groupItems = items.filter(
      (item) => dateKey(item.inicioProgramadoAt, timezone) === claveFecha
    );
    const primeraFecha = groupItems[0].inicioProgramadoAt;
    return {
      claveFecha,
      etiquetaFecha: formatFechaGrupo(primeraFecha, timezone),
      etiquetaRelativa: formatearDiasRestantes(primeraFecha, ahora, timezone),
      items: groupItems
    };
  });
}

export type PostulanteEvaluado = Readonly<{
  id: string;
  name: string;
  estadoDisponibilidad: "DISPONIBLE" | "MUY_PROXIMO" | "CONFLICTO";
  etiquetaDisponibilidad: string;
  minutosMensuales: number;
  detalleConflicto?: string;
}>;

/**
 * Ordena postulantes para el administrador:
 * 1º Disponibles (ordenados de menor a mayor carga horaria en el mes)
 * 2º Muy próximos (ordenados de menor a mayor carga horaria)
 * 3º Conflicto directo
 */
export function ordenarPostulantesParaAdministracion(
  postulantes: readonly PostulanteEvaluado[]
): readonly PostulanteEvaluado[] {
  const prioridadEstado = {
    DISPONIBLE: 0,
    MUY_PROXIMO: 1,
    CONFLICTO: 2
  } as const;

  return postulantes.toSorted((a, b) => {
    const diffEstado = prioridadEstado[a.estadoDisponibilidad] - prioridadEstado[b.estadoDisponibilidad];
    if (diffEstado !== 0) return diffEstado;
  return postulantes.reduce<readonly PostulanteEvaluado[]>((ordered, candidate) => {
    const insertionIndex = ordered.findIndex((item) => {
      const diffEstado = prioridadEstado[candidate.estadoDisponibilidad] - prioridadEstado[item.estadoDisponibilidad];
      if (diffEstado !== 0) return diffEstado < 0;

    const diffCarga = a.minutosMensuales - b.minutosMensuales;
    if (diffCarga !== 0) return diffCarga;
      const diffCarga = candidate.minutosMensuales - item.minutosMensuales;
      if (diffCarga !== 0) return diffCarga < 0;

    return a.name.localeCompare(b.name, "es");
  });
      return candidate.name.localeCompare(item.name, "es") < 0;
    });

    return insertionIndex < 0
      ? [...ordered, candidate]
      : [
          ...ordered.slice(0, insertionIndex),
          candidate,
          ...ordered.slice(insertionIndex)
        ];
  }, []);
}

function dateKey(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone || "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatFechaGrupo(date: Date, timezone: string): string {
  const text = new Intl.DateTimeFormat("es-UY", {
    timeZone: timezone || "America/Montevideo",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric"
  }).format(date);

  return text.charAt(0).toUpperCase() + text.slice(1);
}
