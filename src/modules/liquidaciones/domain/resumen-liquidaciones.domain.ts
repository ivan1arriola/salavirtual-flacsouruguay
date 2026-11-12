import type {
  AsignacionResumenAdministracion,
  AsistenteResumenBase,
  FilaResumenAsistente,
  MontoMoneda,
  RegistroAsistenciaLiquidacion,
  ResumenAsistencia,
  TotalesResumen
} from "./liquidaciones.types";

export function resumirAsignacionesPorAsistente(
  asistentes: readonly AsistenteResumenBase[],
  asignaciones: readonly AsignacionResumenAdministracion[]
): readonly FilaResumenAsistente[] {
  return asistentes.map((asistente) => {
    const propias = asignaciones.filter(({ asistenteTecnicoId }) => asistenteTecnicoId === asistente.id);
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

export function resumirTotales(filas: readonly FilaResumenAsistente[]): TotalesResumen {
  return {
    asistentes: filas.filter(({ activo }) => activo).length,
    reuniones: filas.reduce((total, { reuniones }) => total + reuniones, 0),
    minutos: filas.reduce((total, fila) => total + fila.minutos, 0),
    montos: resumirMontos(
      filas.flatMap(({ montos }) => montos.map(({ moneda, monto }) => ({ monto, moneda })))
    ),
    sinTarifa: filas.reduce((total, { sinTarifa }) => total + sinTarifa, 0)
  };
}

export function resumirMontos(
  items: readonly Readonly<{ monto: number | null; moneda: string }>[]
): readonly MontoMoneda[] {
  const monedas = [...new Set(items.map(({ moneda }) => moneda))];
  return monedas.map((moneda) => ({
    moneda,
    monto: items.reduce((total, item) => total + (item.moneda === moneda ? (item.monto ?? 0) : 0), 0)
  }));
}

export function resumirAsistencias(registros: readonly RegistroAsistenciaLiquidacion[]): ResumenAsistencia {
  return registros.reduce<ResumenAsistencia>(
    (resumen, registro) => ({
      reuniones: resumen.reuniones + 1,
      minutosVirtuales: resumen.minutosVirtuales + (registro.modalidad === "VIRTUAL" ? registro.minutos : 0),
      minutosHibridos: resumen.minutosHibridos + (registro.modalidad === "HIBRIDA" ? registro.minutos : 0),
      montoVirtual: resumen.montoVirtual + (registro.modalidad === "VIRTUAL" ? (registro.monto ?? 0) : 0),
      montoHibrido: resumen.montoHibrido + (registro.modalidad === "HIBRIDA" ? (registro.monto ?? 0) : 0),
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
