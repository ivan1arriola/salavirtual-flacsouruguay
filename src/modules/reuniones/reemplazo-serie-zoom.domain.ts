/**
 * Plan puramente funcional para reemplazar el tramo futuro de una serie por una
 * nueva serie Zoom. No crea, cancela ni provisiona reuniones: esas operaciones
 * requieren un orquestador duradero y una verificación remota previa.
 */
export type EncuentroParaReemplazo = Readonly<{
  id: string;
  estado: string;
  inicio: Date;
  fin: Date;
  proveedor: "GOOGLE_MEET" | "ZOOM";
  tieneLiquidacion?: boolean;
}>;

export type PlanReemplazoSerie = Readonly<{
  estado: "PREPARABLE" | "NO_FUTUROS" | "REVISAR";
  /** Se copian en una NUEVA SolicitudSala/SerieReunion, con IDs propios. */
  copiar: readonly EncuentroParaReemplazo[];
  /** Solo después de verificar la nueva serie se cancelan estos originales. */
  cancelarDespuesDeVerificar: readonly string[];
  /** Nunca se cancelan ni se trasladan; conservan historial, grabaciones y asistencia. */
  conservar: readonly string[];
  errores: readonly string[];
}>;

export function planificarReemplazoSerieZoom(
  encuentros: readonly EncuentroParaReemplazo[],
  ahora: Date
): PlanReemplazoSerie {
  const ids = encuentros.map(({ id }) => id);
  const erroresIniciales = [
    ...(new Set(ids).size !== ids.length
      ? ["La serie contiene identificadores de encuentros duplicados."]
      : []),
    ...(!Number.isFinite(ahora.getTime()) ? ["La fecha de referencia es inválida."] : [])
  ];

  const evaluados = encuentros.reduce<{
    errores: readonly string[];
    conservar: readonly string[];
    copiar: readonly EncuentroParaReemplazo[];
  }>(
    (acc, encuentro) => {
      if (
        !Number.isFinite(encuentro.inicio.getTime()) ||
        !Number.isFinite(encuentro.fin.getTime()) ||
        encuentro.fin <= encuentro.inicio
      ) {
        return {
          ...acc,
          errores: [...acc.errores, `El encuentro ${encuentro.id} tiene un horario inválido.`]
        };
      }
      if (
        ["CANCELADA", "REALIZADA", "FINALIZADA", "EN_CURSO"].includes(encuentro.estado) ||
        encuentro.inicio <= ahora
      ) {
        return { ...acc, conservar: [...acc.conservar, encuentro.id] };
      }
      if (encuentro.estado !== "PROGRAMADA") {
        return {
          ...acc,
          errores: [...acc.errores, `El estado del encuentro ${encuentro.id} requiere revisión manual.`]
        };
      }
      if (encuentro.tieneLiquidacion) {
        return {
          ...acc,
          errores: [
            ...acc.errores,
            `El encuentro ${encuentro.id} tiene liquidaciones que no pueden trasladarse automáticamente.`
          ]
        };
      }
      return { ...acc, copiar: [...acc.copiar, encuentro] };
    },
    { errores: erroresIniciales, conservar: [], copiar: [] }
  );

  const ordenados = evaluados.copiar.reduce<readonly EncuentroParaReemplazo[]>((orden, actual) => {
    const indice = orden.findIndex(
      (item) =>
        actual.inicio.getTime() < item.inicio.getTime() ||
        (actual.inicio.getTime() === item.inicio.getTime() && actual.id.localeCompare(item.id) < 0)
    );
    return indice < 0 ? [...orden, actual] : [...orden.slice(0, indice), actual, ...orden.slice(indice)];
  }, []);
  const superpuestos = ordenados.some((actual, indice) => {
    const anterior = ordenados[indice - 1];
    return anterior !== undefined && actual.inicio < anterior.fin;
  });
  const errores = [
    ...evaluados.errores,
    ...(superpuestos ? ["Hay encuentros futuros superpuestos dentro de la serie."] : [])
  ];
  return {
    estado: errores.length > 0 ? "REVISAR" : ordenados.length === 0 ? "NO_FUTUROS" : "PREPARABLE",
    copiar: errores.length > 0 ? [] : ordenados,
    cancelarDespuesDeVerificar: errores.length > 0 ? [] : ordenados.map(({ id }) => id),
    conservar: evaluados.conservar,
    errores
  };
}
