import type { ArchivoInventarioZoomVista } from "../domain";

export type OcurrenciaInventarioZoomVista = Readonly<{
  id: string;
  uuid: string;
  titulo: string;
  inicioRealAt: Date;
  anfitrionZoomId: string;
  eventoProveedorId: string | null;
  inventariadoAt: Date | null;
  procesamientoPendiente: boolean;
  archivos: readonly ArchivoInventarioZoomVista[];
}>;

export type EntradaInventarioZoom = Readonly<{ pagina: number; vinculo: "TODAS" | "SIN_VINCULO" }>;

export type PaginaInventarioZoom = Readonly<{
  ocurrencias: readonly OcurrenciaInventarioZoomVista[];
  pagina: number;
  totalPaginas: number;
  totalOcurrencias: number;
}>;

/** Lectura del inventario por ocurrencia (con o sin encuentro vinculado). No fabrica un EventoProveedor. */
export interface ZoomInventarioLecturaPort {
  listarInventario(entrada: EntradaInventarioZoom): Promise<PaginaInventarioZoom>;
}
