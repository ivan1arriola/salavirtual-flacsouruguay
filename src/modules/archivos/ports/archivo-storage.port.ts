import type { DestinoConservadoZoom } from "./zoom-archivo-repository.port";

export type DestinoSubidaArchivo = Readonly<{
  /** ID de Drive pregenerado y persistido antes de iniciar la sesión. */
  fileId: string;
  nombre: string;
  carpetaId: string;
  mimeType: string;
  tamanoTotal: bigint | null;
}>;

export type EstadoSubidaArchivo =
  | Readonly<{ estado: "PARCIAL"; bytesConfirmados: bigint }>
  | Readonly<{ estado: "COMPLETA"; destino: DestinoConservadoZoom }>
  | Readonly<{ estado: "VENCIDA" }>;

export type BusquedaConservadoArchivo =
  | Readonly<{ tipo: "NINGUNO" }>
  | Readonly<{ tipo: "UNO"; destino: DestinoConservadoZoom }>
  /** Varios recursos con la misma marca de origen: exige revisión, nunca elegir uno. */
  | Readonly<{ tipo: "AMBIGUO"; cantidad: number }>;

export interface ArchivoStoragePort {
  /** ID de archivo pregenerado por Drive; se persiste antes de iniciar la subida. */
  generarId(): Promise<string>;
  /** `clave` es el hash hexadecimal estable de la ocurrencia (no solo el nombre). */
  asegurarCarpeta(clave: string, nombre: string, padreId: string): Promise<string>;
  /** Devuelve la sesión ya cifrada, lista para persistir. */
  iniciarSubida(destino: DestinoSubidaArchivo, origenKey: string): Promise<string>;
  consultarSubida(
    sesionCifrada: string,
    total: bigint | null,
    signal?: AbortSignal
  ): Promise<EstadoSubidaArchivo>;
  subirBloque(
    sesionCifrada: string,
    offset: bigint,
    bytes: Uint8Array,
    total: bigint | null,
    opciones?: Readonly<{ ultimo?: boolean; signal?: AbortSignal }>
  ): Promise<EstadoSubidaArchivo>;
  /** Primero `files.get(fileId)`, después búsqueda por marca de origen. */
  buscarConservado(
    origenKey: string,
    fileId: string | null,
    signal?: AbortSignal
  ): Promise<BusquedaConservadoArchivo>;
  verificarArchivo(id: string, signal?: AbortSignal): Promise<DestinoConservadoZoom | null>;
  /** Mueve una carpeta (con todo su contenido) al padre indicado conservando su ID; idempotente. */
  moverCarpeta(
    carpetaId: string,
    nuevoPadreId: string,
    signal?: AbortSignal
  ): Promise<"MOVIDA" | "YA_EN_DESTINO" | "NO_ENCONTRADO">;
}
