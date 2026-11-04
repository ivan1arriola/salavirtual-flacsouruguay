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
  const errores: string[] = [];
  const ids = encuentros.map(({ id }) => id);
  if (new Set(ids).size !== ids.length) errores.push("La serie contiene identificadores de encuentros duplicados.");
  if (!Number.isFinite(ahora.getTime())) errores.push("La fecha de referencia es inválida.");

  const conservar: string[] = [];
  const copiar: EncuentroParaReemplazo[] = [];
  for (const encuentro of encuentros) {
    if (!Number.isFinite(encuentro.inicio.getTime()) ||
        !Number.isFinite(encuentro.fin.getTime()) ||
        encuentro.fin <= encuentro.inicio) {
      errores.push(`El encuentro ${encuentro.id} tiene un horario inválido.`);
      continue;
    }
    if (encuentro.estado === "CANCELADA" ||
        encuentro.estado === "REALIZADA" ||
        encuentro.estado === "FINALIZADA" ||
        encuentro.estado === "EN_CURSO" ||
        encuentro.inicio <= ahora) {
      conservar.push(encuentro.id);
      continue;
    }
    if (encuentro.estado !== "PROGRAMADA") {
      errores.push(`El estado del encuentro ${encuentro.id} requiere revisión manual.`);
      continue;
    }
    if (encuentro.tieneLiquidacion) {
      errores.push(`El encuentro ${encuentro.id} tiene liquidaciones que no pueden trasladarse automáticamente.`);
      continue;
    }
    copiar.push(encuentro);
  }

  const ordenados = [...copiar].sort((a, b) => a.inicio.getTime() - b.inicio.getTime() || a.id.localeCompare(b.id));
  for (let i = 1; i < ordenados.length; i++) {
    if (ordenados[i].inicio < ordenados[i - 1].fin) {
      errores.push("Hay encuentros futuros superpuestos dentro de la serie.");
      break;
    }
  }
  return {
    estado: errores.length > 0 ? "REVISAR" : ordenados.length === 0 ? "NO_FUTUROS" : "PREPARABLE",
    copiar: errores.length > 0 ? [] : ordenados,
    cancelarDespuesDeVerificar: errores.length > 0 ? [] : ordenados.map(({ id }) => id),
    conservar,
    errores
  };
}
