import { conciliarMeetReports, type IndicadorConciliacion } from "./meet-reports-reconciliation.domain";

export type FilaVistaAsistencia = Readonly<{
  id: string;
  nombre: string;
  correo: string | null;
  fuente: "MEET" | "REPORTS" | "LEGADO";
  primeraConexion: string | null;
  ultimaDesconexion: string | null;
  minutos: number;
  porcentaje: number;
  cumple: boolean;
  conexiones: number;
  rol?: string;
  conciliacion?: "VERIFICADA" | "SIN_VINCULO";
  diferenciaMinutos?: number | null;
  diferenciaSesiones?: number | null;
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

function convertirFilaAntigua(row: readonly unknown[], index: number, rol?: string): FilaVistaAsistencia | null {
  const nombre = texto(row[0]);
  const correo = emailVerificado(row[1]);
  if (!nombre && !correo) return null;
  const tieneRol = Boolean(rol);
  return {
    id: `${rol ?? "LEGADO"}:${correo ?? nombre}:${index}`,
    nombre: nombre || correo || "Sin identificar",
    correo,
    fuente: "LEGADO",
    primeraConexion: texto(row[tieneRol ? 3 : 2]) || null,
    ultimaDesconexion: texto(row[tieneRol ? 4 : 3]) || null,
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
  reportes: readonly FilaVistaAsistencia[];
  registrosHeredados: readonly FilaVistaAsistencia[];
  indicador: IndicadorConciliacion;
  origenPrincipal: "MEET" | "SIN_MEET";
}> {
  const raw = datos.datosBrutos.slice(1);
  const meetRows = raw.filter(row => texto(row[0]).toUpperCase() === "MEET");
  const auditRows = raw.filter(row =>
    texto(row[0]).toUpperCase() === "REPORTS" || texto(row[0]).toUpperCase() === "REPORTS_IDENTIDAD"
  );
  const reconciled = conciliarMeetReports(
    meetRows.map(row => ({
      nombre: texto(row[1]) || "Sin identificar",
      inicio: texto(row[5]),
      fin: texto(row[6]),
      participanteId: texto(row[3]) || undefined,
      sesionId: texto(row[9]) || undefined,
      correoVerificado: emailVerificado(row[2]) ?? undefined
    })),
    auditRows.map(row => ({
      nombre: texto(row[1]),
      identificador: texto(row[3]),
      tipoIdentificador: texto(row[11]) || texto(row[4]),
      conferenciaId: texto(row[8]),
      endpointId: texto(row[9]),
      inicio: texto(row[5]),
      fin: texto(row[6]),
      timestamp: texto(row[12]) || texto(row[6])
    })),
    inicio,
    fin
  );

  const participantes: readonly FilaVistaAsistencia[] = reconciled.meet.map(person => ({
    id: person.id,
    nombre: person.nombre,
    correo: person.correo,
    fuente: "MEET",
    primeraConexion: person.resumen.primeraConexion,
    ultimaDesconexion: person.resumen.ultimaDesconexion,
    minutos: person.resumen.minutosConectados,
    porcentaje: person.resumen.porcentaje,
    cumple: person.resumen.cumpleCincoSextos,
    conexiones: person.sesiones,
    conciliacion: person.conciliacion,
    diferenciaMinutos: person.diferenciaMinutos,
    diferenciaSesiones: person.diferenciaSesiones
  }));

  const reportes: readonly FilaVistaAsistencia[] = reconciled.reports.map(p => ({
    id: `reports:${p.correo}`,
    nombre: p.nombre,
    correo: p.correo,
    fuente: "REPORTS",
    primeraConexion: p.resumen.primeraConexion,
    ultimaDesconexion: p.resumen.ultimaDesconexion,
    minutos: p.resumen.minutosConectados,
    porcentaje: p.resumen.porcentaje,
    cumple: p.resumen.cumpleCincoSextos,
    conexiones: p.sesiones,
    conciliacion: p.vinculada ? "VERIFICADA" : "SIN_VINCULO"
  }));

  return {
    participantes,
    responsables: datos.responsables.slice(1).flatMap((row, i) => {
      const person = convertirFilaAntigua(row, i, texto(row[2]) || "RESPONSABLE");
      return person ? [person] : [];
    }),
    reportes,
    // Una planilla antigua puede tener filas Reports como asistencia principal.
    // Sin datos brutos de Meet no deben presentarse como asistentes Meet confirmados.
    registrosHeredados: meetRows.length === 0 ? datos.asistencia.slice(1).flatMap((row, i) => {
      const person = convertirFilaAntigua(row, i);
      return person ? [person] : [];
    }) : [],
    indicador: reconciled.indicador,
    origenPrincipal: meetRows.length > 0 ? "MEET" : "SIN_MEET"
  };
}
