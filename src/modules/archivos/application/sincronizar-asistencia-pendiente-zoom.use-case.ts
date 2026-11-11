import type { ResultadoAsistenciaZoom } from "./sincronizar-asistencia-zoom.use-case";

export type RepoAsistenciaPendienteZoom = Readonly<{
  listarOcurrenciasPorSincronizarAsistencia(ahora: Date, limite: number): Promise<readonly string[]>;
}>;

export type ResumenAsistenciaPendienteZoom = Readonly<{
  revisadas: number;
  disponibles: number;
  vacias: number;
  /** Zoom aún no tiene el reporte (404): se reintentará. */
  pendientes: number;
  conflictos: number;
  errores: number;
  /** Códigos (nunca mensajes) de los errores, sin repetir y acotados. */
  codigosError: readonly string[];
}>;

/** Sincroniza la asistencia de las ocurrencias pendientes de a una; el fallo de una no frena a las demás. */
export async function sincronizarAsistenciaPendienteZoomUseCase(
  deps: Readonly<{
    repo: RepoAsistenciaPendienteZoom;
    sincronizar: (ocurrenciaId: string) => Promise<ResultadoAsistenciaZoom>;
    ahora: () => Date;
  }>,
  opciones: Readonly<{ limite: number }>
): Promise<ResumenAsistenciaPendienteZoom> {
  const ids = await deps.repo.listarOcurrenciasPorSincronizarAsistencia(deps.ahora(), opciones.limite);
  let disponibles = 0, vacias = 0, pendientes = 0, conflictos = 0, errores = 0;
  const codigos = new Set<string>();
  for (const id of ids) {
    try {
      const r = await deps.sincronizar(id);
      if (r.tipo === "OK") { if (r.estadoReporte === "DISPONIBLE") disponibles++; else vacias++; }
      else if (r.tipo === "PENDIENTE") pendientes++;
      else if (r.tipo === "CONFLICTO") conflictos++;
      else { errores++; if (codigos.size < 10) codigos.add(r.codigo); }
    } catch {
      errores++;
      if (codigos.size < 10) codigos.add("ERROR_INESPERADO");
    }
  }
  return { revisadas: ids.length, disponibles, vacias, pendientes, conflictos, errores, codigosError: [...codigos] };
}
