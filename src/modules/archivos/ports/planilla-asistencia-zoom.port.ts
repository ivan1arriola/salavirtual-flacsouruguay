import type { FilasPlanillaZoom, RegistroPlanillaZoom, SesionPlanillaZoom } from "../domain";

export type DatosPlanillaAsistenciaZoom = Readonly<{
  titulo: string;
  /** Carpeta destino de Drive del encuentro; null si todavía no se resolvió. */
  carpetaId: string | null;
  /** Identifica la planilla de esta ocurrencia para actualizar la misma en vez de duplicarla. */
  marcador: string;
  registros: readonly RegistroPlanillaZoom[];
  sesiones: readonly SesionPlanillaZoom[];
}>;

export interface LecturaPlanillaAsistenciaZoomPort {
  cargarDatosPlanilla(ocurrenciaId: string): Promise<DatosPlanillaAsistenciaZoom | null>;
}

export interface PlanillasAsistenciaZoomPort {
  /** Crea la planilla directamente en la carpeta destino o actualiza la ya existente del mismo marcador. */
  crearOActualizar(
    entrada: Readonly<{
      titulo: string;
      carpetaId: string;
      marcador: string;
      resumen: FilasPlanillaZoom;
      sesiones: FilasPlanillaZoom;
    }>,
  ): Promise<Readonly<{ webViewUrl: string | null; creada: boolean }>>;
}
