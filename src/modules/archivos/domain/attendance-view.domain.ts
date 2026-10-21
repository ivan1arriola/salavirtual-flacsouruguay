import { resumirIntervalosAsistencia } from "./meet-attendance-summary.domain";

export type FilaVistaAsistencia = Readonly<{
  id: string;
  nombre: string;
  correo: string | null;
  fuente: "REPORTS" | "MEET";
  primeraConexion: string | null;
  ultimaDesconexion: string | null;
  minutos: number;
  porcentaje: number;
  cumple: boolean;
  conexiones: number;
  rol?: string;
}>;

export type DatosPlanillaAsistencia = Readonly<{
  asistencia: readonly (readonly unknown[])[];
  responsables: readonly (readonly unknown[])[];
  datosBrutos: readonly (readonly unknown[])[];
}>;

function texto(value: unknown): string {
  return typeof value === "string" ? value.trim() : value == null ? "" : String(value);
}

function numero(value: unknown): number {
  const valueNumber = typeof value === "number" ? value : Number(texto(value).replace(",", "."));
  return Number.isFinite(valueNumber) ? valueNumber : 0;
}

function porcentaje(value: unknown): number {
  const raw = texto(value);
  const amount = numero(raw.replace("%", ""));
  return Math.min(100, Math.max(0, Math.round((raw.includes("%") || amount > 1 ? amount : amount * 100) * 100) / 100));
}

function emailVerificado(value: unknown): string | null {
  const candidate = texto(value).toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null;
}

function convertirFila(row: readonly unknown[], index: number, rol?: string): FilaVistaAsistencia | null {
  const nombre = texto(row[0]);
  const correo = emailVerificado(row[1]);
  if (!nombre && !correo) return null;
  const tieneRol = Boolean(rol);
  const primera = texto(row[tieneRol ? 3 : 2]);
  const ultima = texto(row[tieneRol ? 4 : 3]);
  return {
    id: `${rol ?? "PARTICIPANTE"}:${correo ?? nombre}:${index}`,
    nombre: nombre || correo || "Sin identificar",
    correo,
    fuente: correo ? "REPORTS" : "MEET",
    primeraConexion: primera || null,
    ultimaDesconexion: ultima || null,
    minutos: Math.max(0, numero(row[tieneRol ? 5 : 4])),
    porcentaje: tieneRol ? 0 : porcentaje(row[5]),
    cumple: tieneRol ? false : texto(row[6]) === "CUMPLE",
    conexiones: Math.max(0, numero(row[tieneRol ? 6 : 7])),
    ...(rol ? { rol } : {})
  };
}

export function construirVistaAsistencia(
  datos: DatosPlanillaAsistencia,
  inicio: Date,
  fin: Date
): Readonly<{
  participantes: readonly FilaVistaAsistencia[];
  responsables: readonly FilaVistaAsistencia[];
  registrosMeet: readonly FilaVistaAsistencia[];
  eventosMeet: number;
  eventosReports: number;
}> {
  const participantes = datos.asistencia.slice(1).flatMap((row, index) => {
    const item = convertirFila(row, index);
    return item ? [item] : [];
  });
  const responsables = datos.responsables.slice(1).flatMap((row, index) => {
    const rol = texto(row[2]) || "RESPONSABLE";
    const item = convertirFila(row, index, rol);
    return item ? [item] : [];
  });

  // Reports y Meet no comparten necesariamente IDs de persona. Esos registros
  // permanecen separados: nunca asociar por coincidencias de nombre u horario.
  const grupos = new Map<string, { nombre: string; sesiones: { inicio: string; fin: string }[] }>();
  const raw = datos.datosBrutos.slice(1);
  for (const [index, row] of raw.entries()) {
    if (texto(row[0]).toUpperCase() !== "MEET") continue;
    const start = texto(row[5]);
    const end = texto(row[6]);
    if (!Number.isFinite(Date.parse(start)) || !Number.isFinite(Date.parse(end))) continue;
    const participanteId = texto(row[3]);
    const key = participanteId || `sin-id-${index}`;
    const group = grupos.get(key);
    const sesion = { inicio: start, fin: end };
    if (group) group.sesiones.push(sesion);
    else grupos.set(key, { nombre: texto(row[1]) || "Sin identificar", sesiones: [sesion] });
  }
  const registrosMeet = [...grupos.entries()].map(([key, item]) => {
    const resumen = resumirIntervalosAsistencia(item.sesiones, inicio, fin);
    return {
      id: key,
      nombre: item.nombre,
      correo: null,
      fuente: "MEET" as const,
      primeraConexion: resumen.primeraConexion,
      ultimaDesconexion: resumen.ultimaDesconexion,
      minutos: resumen.minutosConectados,
      porcentaje: resumen.porcentaje,
      cumple: resumen.cumpleCincoSextos,
      conexiones: resumen.conexiones
    };
  }).sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));

  return {
    participantes,
    responsables,
    registrosMeet,
    eventosMeet: raw.filter((row) => texto(row[0]).toUpperCase() === "MEET").length,
    eventosReports: raw.filter((row) => texto(row[0]).toUpperCase() === "REPORTS").length
  };
}
