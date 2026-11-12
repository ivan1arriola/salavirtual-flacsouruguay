export type ReferenciaOcurrenciaZoom = Readonly<{
  cuentaZoomId: string;
  uuid: string;
  meetingId: string;
  anfitrionZoomId: string;
  inicioRealAt: Date;
  titulo: string;
}>;
export type ArchivoOrigenZoom = Readonly<{
  claveOrigen: string;
  archivoZoomId: string | null;
  coleccion: string;
  tipoOriginal: string;
  variante: string | null;
  extension: string | null;
  inicioAt: Date | null;
  finAt: Date | null;
  tamanoBytes: bigint | null;
  estadoOrigen: string | null;
  descargable: boolean;
}>;
export type EstadoArchivoZoom =
  | "DESCUBIERTO"
  | "PROCESANDO_ORIGEN"
  | "PENDIENTE"
  | "COPIANDO"
  | "CONSERVADO"
  | "ERROR_REINTENTABLE"
  | "REQUIERE_REVISION";
export type ResultadoPagina<T> = Readonly<{ elementos: readonly T[]; siguiente: string | null }>;
export type LeaseArchivoZoom = Readonly<{ archivoId: string; version: number; venceAt: Date }>;
