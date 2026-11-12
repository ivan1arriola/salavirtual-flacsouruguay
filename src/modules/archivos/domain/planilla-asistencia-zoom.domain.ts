/** Contenido de la planilla y de la exportación de asistencia Zoom: resumen consolidado y sesiones originales por separado. */

export type RolComprobadoZoom = "HOST" | "COHOST" | null;

export type RegistroPlanillaZoom = Readonly<{
  nombre: string;
  /** Correo que informó Zoom: observado, no identidad confirmada. */
  emailObservado: string | null;
  /** Correo del invitado conciliado por una persona autorizada; null si nadie lo confirmó. */
  emailConfirmado: string | null;
  primeraEntradaAt: Date | null;
  ultimaSalidaAt: Date | null;
  minutos: number;
  porcentaje: number;
  sesiones: number;
  estadoConciliacion: "SIN_CONCILIAR" | "SUGERIDO" | "CONCILIADO" | "EXTERNO";
  rolComprobado: RolComprobadoZoom;
}>;

export type SesionPlanillaZoom = Readonly<{
  nombre: string;
  email: string | null;
  entradaAt: Date;
  salidaAt: Date;
  status: string | null;
  participanteId: string | null;
}>;

export type CeldaPlanillaZoom = string | number;
export type FilasPlanillaZoom = readonly (readonly CeldaPlanillaZoom[])[];

export const COLUMNAS_RESUMEN_ZOOM = [
  "Participante",
  "Correo informado por Zoom",
  "Correo confirmado",
  "Primera entrada (UY)",
  "Última salida (UY)",
  "Minutos",
  "Asistencia (%)",
  "Conexiones",
  "Conciliación",
  "Rol comprobado"
] as const;

export const COLUMNAS_SESIONES_ZOOM = [
  "Participante",
  "Correo informado por Zoom",
  "Entrada (UTC)",
  "Salida (UTC)",
  "Duración (seg)",
  "Estado",
  "Identificador de participante"
] as const;

const ETIQUETA_CONCILIACION = {
  SIN_CONCILIAR: "Sin conciliar",
  SUGERIDO: "Sugerido (sin confirmar)",
  CONCILIADO: "Conciliado",
  EXTERNO: "Externo"
} as const;

/**
 * Los nombres y correos vienen de personas externas: un valor que empiece con `=`, `+`, `-`, `@`, tabulación o
 * retorno se prefija con `'` para que ninguna hoja de cálculo lo interprete como fórmula.
 */
export function escaparCeldaPlanillaZoom(valor: string): string {
  return /^[\s﻿]*[=+\-@]/.test(valor) || /^[\t\r]/.test(valor) ? `'${valor}` : valor;
}

const texto = (valor: string | null): string => escaparCeldaPlanillaZoom(valor ?? "");

function horaUruguay(fecha: Date | null): string {
  if (!fecha || !Number.isFinite(fecha.getTime())) {
    return "";
  }
  return new Intl.DateTimeFormat("es-UY", {
    timeZone: "America/Montevideo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false
  }).format(fecha);
}

const iso = (fecha: Date): string => (Number.isFinite(fecha.getTime()) ? fecha.toISOString() : "");

export function filasResumenPlanillaZoom(registros: readonly RegistroPlanillaZoom[]): FilasPlanillaZoom {
  return [
    COLUMNAS_RESUMEN_ZOOM,
    ...registros.map((r): readonly CeldaPlanillaZoom[] => [
      texto(r.nombre),
      texto(r.emailObservado),
      texto(r.emailConfirmado),
      horaUruguay(r.primeraEntradaAt),
      horaUruguay(r.ultimaSalidaAt),
      r.minutos,
      r.porcentaje,
      r.sesiones,
      ETIQUETA_CONCILIACION[r.estadoConciliacion],
      r.rolComprobado ?? ""
    ])
  ];
}

export function filasSesionesPlanillaZoom(sesiones: readonly SesionPlanillaZoom[]): FilasPlanillaZoom {
  return [
    COLUMNAS_SESIONES_ZOOM,
    ...sesiones.map((s): readonly CeldaPlanillaZoom[] => [
      texto(s.nombre),
      texto(s.email),
      iso(s.entradaAt),
      iso(s.salidaAt),
      Math.max(0, Math.round((s.salidaAt.getTime() - s.entradaAt.getTime()) / 1000)),
      s.status ?? "",
      texto(s.participanteId)
    ])
  ];
}

export type ConjuntoExportacionZoom = "resumen" | "sesiones";

/** Estructura común con la exportación existente: la sirve Sala Virtual, no Drive, y no cruza datos con Meet. */
export function exportacionAsistenciaZoom(
  conjunto: ConjuntoExportacionZoom,
  registros: readonly RegistroPlanillaZoom[],
  sesiones: readonly SesionPlanillaZoom[]
): Readonly<{ fuente: "zoom"; columnas: readonly string[]; registros: FilasPlanillaZoom }> {
  const filas =
    conjunto === "resumen" ? filasResumenPlanillaZoom(registros) : filasSesionesPlanillaZoom(sesiones);
  return { fuente: "zoom", columnas: filas[0] as readonly string[], registros: filas.slice(1) };
}
