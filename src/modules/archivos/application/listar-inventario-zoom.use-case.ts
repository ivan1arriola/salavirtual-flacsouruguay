import { puedeVerInventarioZoom } from "../domain";
import type { EntradaInventarioZoom, PaginaInventarioZoom, ZoomInventarioLecturaPort } from "../ports";

export type ResultadoInventarioZoomListado =
  Readonly<{ tipo: "OK"; pagina: PaginaInventarioZoom }> | Readonly<{ tipo: "PROHIBIDO" }>;

/** Inventario de archivos Zoom: solo administración, verificado aquí y no solo ocultando controles. */
export async function listarInventarioZoomUseCase(
  repo: ZoomInventarioLecturaPort,
  actor: Readonly<{ id: string; rol: "ADMINISTRACION" | "DOCENTE" | "ASISTENTE_TECNICO" }>,
  entrada: EntradaInventarioZoom
): Promise<ResultadoInventarioZoomListado> {
  if (!puedeVerInventarioZoom(actor.rol)) {
    return { tipo: "PROHIBIDO" };
  }
  const pagina = Number.isInteger(entrada.pagina) && entrada.pagina >= 1 ? entrada.pagina : 1;
  return { tipo: "OK", pagina: await repo.listarInventario({ pagina, vinculo: entrada.vinculo }) };
}
