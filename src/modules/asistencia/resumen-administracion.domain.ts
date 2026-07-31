import { claveMesUtc3 } from "./resumen-personal.domain";

export type AsistenteResumenBase = Readonly<{
  id: string;
  usuarioId: string;
  nombre: string;
  email: string | null;
  activo: boolean;
}>;

export type AsignacionResumenAdministracion = Readonly<{
  asistenteId: string;
  modalidad: "VIRTUAL" | "HIBRIDA";
  minutos: number;
  monto: number | null;
  moneda: string;
}>;

export type MontoMoneda = Readonly<{ moneda: string; monto: number }>;

export type FilaResumenAsistente = AsistenteResumenBase & Readonly<{
  reuniones: number;
  virtuales: number;
  hibridas: number;
  minutos: number;
  montos: readonly MontoMoneda[];
  sinTarifa: number;
}>;

export type PeriodoMes = Readonly<{
  clave: string;
  desdeMs: number;
  hastaMs: number;
  anterior: string;
  siguiente: string;
}>;

export function resolverPeriodoMes(valor: string | undefined, ahora: Date): PeriodoMes {
  const fallback = claveMesUtc3(ahora);
  const clave = valor && /^\d{4}-(0[1-9]|1[0-2])$/.test(valor) ? valor : fallback;
  const [year, month] = clave.split("-").map(Number);
  return {
    clave,
    desdeMs: Date.UTC(year, month - 1, 1, 3),
    hastaMs: Date.UTC(year, month, 1, 3),
    anterior: claveDesdeUtc(year, month - 2),
    siguiente: claveDesdeUtc(year, month)
  };
}

export function resumirAsignacionesPorAsistente(
  asistentes: readonly AsistenteResumenBase[],
  asignaciones: readonly AsignacionResumenAdministracion[]
): readonly FilaResumenAsistente[] {
  return asistentes.map((asistente) => {
    const propias = asignaciones.filter(({ asistenteId }) => asistenteId === asistente.id);
    return {
      ...asistente,
      reuniones: propias.length,
      virtuales: propias.filter(({ modalidad }) => modalidad === "VIRTUAL").length,
      hibridas: propias.filter(({ modalidad }) => modalidad === "HIBRIDA").length,
      minutos: propias.reduce((total, { minutos }) => total + minutos, 0),
      montos: resumirMontos(propias),
      sinTarifa: propias.filter(({ monto }) => monto === null).length
    };
  });
}

export function resumirTotales(filas: readonly FilaResumenAsistente[]) {
  return {
    asistentes: filas.filter(({ activo }) => activo).length,
    reuniones: filas.reduce((total, { reuniones }) => total + reuniones, 0),
    minutos: filas.reduce((total, fila) => total + fila.minutos, 0),
    montos: resumirMontos(filas.flatMap(({ montos }) =>
      montos.map(({ moneda, monto }) => ({ monto, moneda }))
    )),
    sinTarifa: filas.reduce((total, { sinTarifa }) => total + sinTarifa, 0)
  };
}

function resumirMontos(
  items: readonly Readonly<{ monto: number | null; moneda: string }>[]
): readonly MontoMoneda[] {
  return [...new Set(items.map(({ moneda }) => moneda))].map((moneda) => ({
    moneda,
    monto: items.reduce(
      (total, item) => total + (item.moneda === moneda ? item.monto ?? 0 : 0),
      0
    )
  }));
}

function claveDesdeUtc(year: number, zeroBasedMonth: number): string {
  const absoluteMonth = year * 12 + zeroBasedMonth;
  const normalizedYear = Math.floor(absoluteMonth / 12);
  const normalizedMonth = absoluteMonth - normalizedYear * 12;
  return `${normalizedYear}-${String(normalizedMonth + 1).padStart(2, "0")}`;
}
