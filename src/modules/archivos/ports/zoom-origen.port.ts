import type { ArchivoOrigenZoom, ReferenciaOcurrenciaZoom } from "../domain";

export type DescargaOrigenZoom =
  | Readonly<{
      tipo: "CONTENIDO";
      contenido: AsyncIterable<Uint8Array>;
      /** Offset al que corresponde el primer byte (0 si Zoom ignoró Range). */
      offsetOrigen: bigint;
      totalBytes: bigint | null;
    }>
  | Readonly<{ tipo: "REQUIERE_REVISION"; motivo: string }>;

/** Acceso a los archivos de Zoom. La URL autorizada solo existe dentro del adaptador. */
export interface OrigenZoomPort {
  /** Refresca inventario y credenciales en cada intento antes de abrir el stream. */
  abrirDescarga(
    ocurrencia: ReferenciaOcurrenciaZoom,
    recurso: ArchivoOrigenZoom,
    offset: bigint,
    signal: AbortSignal
  ): Promise<DescargaOrigenZoom>;
}
