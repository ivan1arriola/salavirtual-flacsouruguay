export type ModalidadAsistencia = "VIRTUAL" | "HIBRIDA";

export type RegistroAsistenciaPersonal = Readonly<{
  id: string;
  instanciaId: string;
  titulo: string;
  programa: string;
  docente: string;
  inicioAt: Date;
  finAt: Date;
  modalidad: ModalidadAsistencia;
  estado: string;
  completada: boolean;
  minutos: number;
  minutosProgramados: number;
  minutosReportados: number | null;
  comentarioReporte: string | null;
  tarifaHora: number | null;
  monto: number | null;
  moneda: string;
}>;

export type ResumenAsistencia = Readonly<{
  reuniones: number;
  minutosVirtuales: number;
  minutosHibridos: number;
  montoVirtual: number;
  montoHibrido: number;
  monto: number;
}>;

const utc3PartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Montevideo",
  year: "numeric",
  month: "2-digit"
});

function yearAndMonthUtc3(fecha: Date): Readonly<{ year: number; month: number }> {
  const parts = utc3PartsFormatter.formatToParts(fecha);
  const value = (type: "year" | "month") =>
    Number(parts.find((part) => part.type === type)?.value);
  return { year: value("year"), month: value("month") };
}

export function rangoMesUtc3(fecha: Date): Readonly<{ desdeMs: number; hastaMs: number }> {
  const { year, month } = yearAndMonthUtc3(fecha);
  return {
    desdeMs: Date.UTC(year, month - 1, 1, 3),
    hastaMs: Date.UTC(year, month, 1, 3)
  };
}

export function claveMesUtc3(fecha: Date): string {
  const { year, month } = yearAndMonthUtc3(fecha);
  return `${year}-${String(month).padStart(2, "0")}`;
}

export function calcularMinutos(
  programado: Readonly<{ inicio: Date; fin: Date }>,
  confirmado: number | null,
  reportado: number | null,
  real: Readonly<{ inicio: Date | null; fin: Date | null }>
): number {
  if (confirmado !== null) return Math.max(0, confirmado);
  if (reportado !== null) return Math.max(0, reportado);
  const inicio = real.inicio ?? programado.inicio;
  const fin = real.fin ?? programado.fin;
  return Math.max(0, Math.round((fin.getTime() - inicio.getTime()) / 60_000));
}

export function calcularMonto(
  montoConfirmado: number | null,
  tarifaHora: number | null,
  minutos: number
): number | null {
  if (montoConfirmado !== null) return montoConfirmado;
  return tarifaHora === null ? null : (tarifaHora * minutos) / 60;
}

export function esAsistenciaCompletada(
  estado: string,
  finProgramadoMs: number,
  ahoraMs: number
): boolean {
  return estado === "FINALIZADA" || finProgramadoMs <= ahoraMs;
}

export function resumirAsistencias(
  registros: readonly RegistroAsistenciaPersonal[]
): ResumenAsistencia {
  return registros.reduce<ResumenAsistencia>(
    (resumen, registro) => ({
      reuniones: resumen.reuniones + 1,
      minutosVirtuales:
        resumen.minutosVirtuales + (registro.modalidad === "VIRTUAL" ? registro.minutos : 0),
      minutosHibridos:
        resumen.minutosHibridos + (registro.modalidad === "HIBRIDA" ? registro.minutos : 0),
      montoVirtual:
        resumen.montoVirtual + (registro.modalidad === "VIRTUAL" ? registro.monto ?? 0 : 0),
      montoHibrido:
        resumen.montoHibrido + (registro.modalidad === "HIBRIDA" ? registro.monto ?? 0 : 0),
      monto: resumen.monto + (registro.monto ?? 0)
    }),
    {
      reuniones: 0,
      minutosVirtuales: 0,
      minutosHibridos: 0,
      montoVirtual: 0,
      montoHibrido: 0,
      monto: 0
    }
  );
}

export function agruparPorMes(
  registros: readonly RegistroAsistenciaPersonal[]
): ReadonlyArray<Readonly<{ clave: string; registros: readonly RegistroAsistenciaPersonal[] }>> {
  const claves = [...new Set(registros.map(({ inicioAt }) => claveMesUtc3(inicioAt)))];
  return claves.map((clave) => ({
    clave,
    registros: registros.filter(({ inicioAt }) => claveMesUtc3(inicioAt) === clave)
  }));
}
