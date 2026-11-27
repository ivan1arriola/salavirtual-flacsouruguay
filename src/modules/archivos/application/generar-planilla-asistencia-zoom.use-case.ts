import { filasResumenPlanillaZoom, filasSesionesPlanillaZoom } from "../domain";
import type { LecturaPlanillaAsistenciaZoomPort, PlanillasAsistenciaZoomPort } from "../ports";

export type ResultadoPlanillaZoom =
  | Readonly<{ tipo: "OK"; webViewUrl: string | null }>
  /** Todavía no hay registro final: no se genera una lista vacía que parezca prueba de cero asistentes. */
  | Readonly<{ tipo: "PENDIENTE" }>
  | Readonly<{ tipo: "SIN_CARPETA" }>
  | Readonly<{ tipo: "ERROR"; codigo: string }>;

/**
 * Genera o actualiza la planilla de Drive desde lo ya guardado en base de datos. Un fallo de Drive nunca
 * afecta a la asistencia persistida y se puede reintentar de forma independiente.
 */
export async function generarPlanillaAsistenciaZoomUseCase(
  deps: Readonly<{
    lectura: LecturaPlanillaAsistenciaZoomPort;
    planillas: PlanillasAsistenciaZoomPort;
  }>,
  ocurrenciaId: string,
): Promise<ResultadoPlanillaZoom | Readonly<{ tipo: "ERROR"; codigo: "NO_ENCONTRADA" }>> {
  const datos = await deps.lectura.cargarDatosPlanilla(ocurrenciaId);
  if (!datos) {
    return { tipo: "ERROR", codigo: "NO_ENCONTRADA" };
  }
  if (datos.registros.length === 0) {
    return { tipo: "PENDIENTE" };
  }
  if (!datos.carpetaId) {
    return { tipo: "SIN_CARPETA" };
  }
  try {
    const { webViewUrl } = await deps.planillas.crearOActualizar({
      titulo: datos.titulo,
      carpetaId: datos.carpetaId,
      marcador: datos.marcador,
      resumen: filasResumenPlanillaZoom(datos.registros),
      sesiones: filasSesionesPlanillaZoom(datos.sesiones),
    });
    return { tipo: "OK", webViewUrl };
  } catch (error) {
    // Solo un código corto: el mensaje de Google podría traer URLs, IDs o tokens.
    const nombre = error && typeof error === "object" ? (error as { name?: unknown }).name : null;
    return {
      tipo: "ERROR",
      codigo:
        typeof nombre === "string" && /^[A-Za-z0-9_]{1,60}$/.test(nombre) ? nombre : "ERROR_DRIVE",
    };
  }
}
