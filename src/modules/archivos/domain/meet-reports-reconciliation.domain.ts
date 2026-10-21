import { resumirIntervalosAsistencia, type ResumenIntervalosAsistencia } from "./meet-attendance-summary.domain";

export type SesionMeetConciliable = Readonly<{
  nombre: string;
  inicio: string;
  fin: string;
  participanteId?: string;
  sesionId?: string;
  correoVerificado?: string;
}>;

export type EventoReportsConciliable = Readonly<{
  nombre: string;
  identificador: string;
  tipoIdentificador: string;
  conferenciaId: string;
  endpointId: string;
  inicio: string;
  fin: string;
  timestamp: string;
}>;

export type PersonaMeetConciliada = Readonly<{
  id: string;
  nombre: string;
  correo: string | null;
  sesiones: number;
  resumen: ResumenIntervalosAsistencia;
  conciliacion: "VERIFICADA" | "SIN_VINCULO";
  diferenciaMinutos: number | null;
  diferenciaSesiones: number | null;
}>;

export type PersonaReportsConciliada = Readonly<{
  correo: string;
  nombre: string;
  sesiones: number;
  resumen: ResumenIntervalosAsistencia;
  vinculada: boolean;
}>;

export type IndicadorConciliacion = Readonly<{
  personasMeet: number;
  sesionesMeet: number;
  correosReports: number;
  sesionesReports: number;
  registrosReportsSinCorreo: number;
  personasVinculadas: number;
  meetSinVincular: number;
  correosSinVincular: number;
  diferenciaPersonas: number;
  diferenciaSesiones: number;
  sesionesReportsSinSolapamiento: number;
  conferenciasReports: number;
  estado: "SIN_MEET" | "SIN_REPORTS" | "CONFERENCIA_AMBIGUA" | "PARCIAL" | "VINCULADA";
}>;

export type ResultadoConciliacion = Readonly<{
  meet: readonly PersonaMeetConciliada[];
  reports: readonly PersonaReportsConciliada[];
  indicador: IndicadorConciliacion;
}>;

function correoValido(value: string): string | null {
  const valueLower = value.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(valueLower) ? valueLower : null;
}

function intervaloValido(inicio: string, fin: string): boolean {
  return Number.isFinite(Date.parse(inicio)) && Number.isFinite(Date.parse(fin)) && Date.parse(fin) > Date.parse(inicio);
}

function haySolapamiento(a: Readonly<{ inicio: string; fin: string }>, b: Readonly<{ inicio: string; fin: string }>): boolean {
  return Date.parse(a.inicio) < Date.parse(b.fin) && Date.parse(b.inicio) < Date.parse(a.fin);
}

/**
 * Meet es la fuente principal. Reports solo añade correo a una fila de Meet si
 * Meet ya tiene ese correo expresamente verificado y la coincidencia es única.
 * Ni nombre, ni horarios ni IDs de conferencia entre APIs prueban identidad.
 */
export function conciliarMeetReports(
  sesionesMeet: readonly SesionMeetConciliable[],
  eventosReports: readonly EventoReportsConciliable[],
  inicio: Date,
  fin: Date,
): ResultadoConciliacion {
  const sesionesValidas = sesionesMeet.filter(s => intervaloValido(s.inicio, s.fin));
  const meetGrupos = sesionesValidas.reduce<Readonly<Record<string, {
    nombre: string;
    correo: string | null;
    sesiones: readonly SesionMeetConciliable[];
    keys: readonly string[];
  }>>>((acumulado, sesion, index) => {
    const key = sesion.participanteId?.trim() || sesion.sesionId?.trim() || `fila-${index}`;
    const previo = acumulado[key];
    const sesionKey = sesion.sesionId?.trim() || `${sesion.inicio}|${sesion.fin}`;
    if (previo?.keys.includes(sesionKey)) return acumulado;
    const correo = correoValido(sesion.correoVerificado ?? "");
    return {
      ...acumulado,
      [key]: {
        nombre: previo?.nombre ?? sesion.nombre,
        correo: previo?.correo ?? correo,
        sesiones: [...(previo?.sesiones ?? []), sesion],
        keys: [...(previo?.keys ?? []), sesionKey],
      }
    };
  }, {});

  const reportEventos = eventosReports
    .filter(e => intervaloValido(e.inicio, e.fin))
    .reduce<readonly EventoReportsConciliable[]>((acc, current) => {
      const key = [current.conferenciaId, current.endpointId, current.identificador, current.timestamp, current.inicio, current.fin].join("|");
      return acc.some(e => [e.conferenciaId, e.endpointId, e.identificador, e.timestamp, e.inicio, e.fin].join("|") === key)
        ? acc : [...acc, current];
    }, []);
  const reportConferencias = [...new Set(reportEventos.map(e => e.conferenciaId).filter(Boolean))];
  // Cuando varias conferencias de auditoría se solapan, sus correos no se
  // atribuyen a la instancia ni se comparan individualmente.
  const conferenciaUnica = reportConferencias.length === 1;
  const reportGrupos = reportEventos.reduce<Readonly<Record<string, {
    nombre: string;
    eventos: readonly EventoReportsConciliable[];
  }>>>((acc, evento) => {
    const email = evento.tipoIdentificador === "email_address" ? correoValido(evento.identificador) : null;
    if (!email) return acc;
    const prev = acc[email];
    return { ...acc, [email]: { nombre: prev?.nombre || evento.nombre || email, eventos: [...(prev?.eventos ?? []), evento] } };
  }, {});

  const gruposMeet = Object.entries(meetGrupos);
  const emailsDeMeet = gruposMeet.reduce<Readonly<Record<string, number>>>((acc, [, person]) =>
    person.correo ? { ...acc, [person.correo]: (acc[person.correo] ?? 0) + 1 } : acc, {});

  const reports = Object.entries(reportGrupos).map(([correo, group]) => {
    const resumen = resumirIntervalosAsistencia(group.eventos, inicio, fin);
    return {
      correo,
      nombre: group.nombre,
      sesiones: group.eventos.length,
      resumen,
      vinculada: conferenciaUnica && (emailsDeMeet[correo] ?? 0) === 1
    };
  });

  const meet = gruposMeet.map(([id, group]) => {
    const email = group.correo;
    const reporte = conferenciaUnica && email && (emailsDeMeet[email] ?? 0) === 1
      ? reports.find(r => r.correo === email) : undefined;
    const resumen = resumirIntervalosAsistencia(group.sesiones, inicio, fin);
    return {
      id,
      nombre: group.nombre,
      correo: group.correo,
      sesiones: group.sesiones.length,
      resumen,
      conciliacion: reporte ? "VERIFICADA" as const : "SIN_VINCULO" as const,
      diferenciaMinutos: reporte ? Math.round((resumen.minutosConectados - reporte.resumen.minutosConectados) * 100) / 100 : null,
      diferenciaSesiones: reporte ? group.sesiones.length - reporte.sesiones : null
    };
  });

  const vinculadas = meet.filter(m => m.conciliacion === "VERIFICADA").length;
  const sesionesMeetTotal = meet.reduce((acc, m) => acc + m.sesiones, 0);
  const sesionesReportsTotal = reportEventos.length;
  const reportSinSolapamiento = reportEventos.filter(e => !sesionesValidas.some(s => haySolapamiento(e, s))).length;
  const indicador: IndicadorConciliacion = {
    personasMeet: meet.length,
    sesionesMeet: sesionesMeetTotal,
    correosReports: reports.length,
    sesionesReports: sesionesReportsTotal,
    registrosReportsSinCorreo: reportEventos.filter(e => e.tipoIdentificador !== "email_address" || !correoValido(e.identificador)).length,
    personasVinculadas: vinculadas,
    meetSinVincular: meet.length - vinculadas,
    correosSinVincular: reports.filter(r => !r.vinculada).length,
    diferenciaPersonas: meet.length - reports.length,
    diferenciaSesiones: sesionesMeetTotal - sesionesReportsTotal,
    sesionesReportsSinSolapamiento: reportSinSolapamiento,
    conferenciasReports: reportConferencias.length,
    estado: meet.length === 0 ? "SIN_MEET"
      : reportEventos.length === 0 ? "SIN_REPORTS"
      : reportConferencias.length !== 1 ? "CONFERENCIA_AMBIGUA"
      : vinculadas === meet.length && vinculadas === reports.length ? "VINCULADA"
      : "PARCIAL"
  };
  return { meet, reports, indicador };
}
