import type { JWT } from "google-auth-library";
import {
  consultarSubidaDriveReanudable,
  iniciarSubidaDriveReanudable,
  listarArchivosDrivePorOrigen,
  obtenerArchivoDrivePorId,
  obtenerOCrearCarpetaDrive,
  subirBloqueDriveReanudable,
  type ArchivoDriveSubido,
  type ResultadoSubidaDrive
} from "../../../../integrations/google";
import type {
  ArchivoStoragePort,
  BusquedaConservadoArchivo,
  DestinoSubidaArchivo,
  EstadoSubidaArchivo
} from "../../ports";
import type { DestinoConservadoZoom } from "../../ports";

export type GoogleDriveArchivoStorageDeps = Readonly<{
  auth: JWT;
  /** `cifrarConfiguracion`: la URL de sesión es una credencial de subida. */
  cifrar: (valor: string) => string;
  descifrar: (valor: string) => string;
}>;

function aDestino(a: ArchivoDriveSubido): DestinoConservadoZoom {
  return {
    id: a.id,
    nombre: a.name ?? "",
    tamanoBytes: BigInt(a.size ?? "0"),
    mimeType: a.mimeType ?? null,
    webViewUrl: a.webViewLink ?? null
  };
}

function aEstado(r: ResultadoSubidaDrive): EstadoSubidaArchivo {
  return r.estado === "COMPLETA" ? { estado: "COMPLETA", destino: aDestino(r.archivo) } : r;
}

/**
 * Almacena en Drive solo con la identidad de servicio general ya configurada. No aplica permisos
 * por enlace: los binarios heredan los de la carpeta y los históricos sin vincular quedan en una
 * carpeta solo de administración.
 */
export class GoogleDriveArchivoStorageAdapter implements ArchivoStoragePort {
  constructor(private readonly deps: GoogleDriveArchivoStorageDeps) {}

  asegurarCarpeta(clave: string, nombre: string, padreId: string): Promise<string> {
    return obtenerOCrearCarpetaDrive(this.deps.auth, padreId, nombre, clave);
  }

  async iniciarSubida(destino: DestinoSubidaArchivo, origenKey: string): Promise<string> {
    const url = await iniciarSubidaDriveReanudable(this.deps.auth, {
      fileId: destino.fileId, nombre: destino.nombre, carpetaId: destino.carpetaId,
      mimeType: destino.mimeType, origenHash: origenKey, tamanoTotal: destino.tamanoTotal
    });
    return this.deps.cifrar(url);
  }

  async consultarSubida(sesionCifrada: string, total: bigint | null, signal?: AbortSignal): Promise<EstadoSubidaArchivo> {
    return aEstado(await consultarSubidaDriveReanudable(this.deps.auth, this.deps.descifrar(sesionCifrada), total, { signal }));
  }

  async subirBloque(
    sesionCifrada: string, offset: bigint, bytes: Uint8Array, total: bigint | null,
    opciones: Readonly<{ ultimo?: boolean; signal?: AbortSignal }> = {}
  ): Promise<EstadoSubidaArchivo> {
    return aEstado(await subirBloqueDriveReanudable(
      this.deps.auth, this.deps.descifrar(sesionCifrada), offset, bytes, total, opciones
    ));
  }

  async buscarConservado(origenKey: string, fileId: string | null, signal?: AbortSignal): Promise<BusquedaConservadoArchivo> {
    if (fileId) {
      const porId = await obtenerArchivoDrivePorId(this.deps.auth, fileId, { signal });
      // Un archivo con tamaño pero aún sin finalizar no existe en Drive: solo cuenta lo completo.
      if (porId && !porId.trashed && porId.size !== undefined) return { tipo: "UNO", destino: aDestino(porId) };
    }
    const marcados = await listarArchivosDrivePorOrigen(this.deps.auth, origenKey, { signal });
    if (marcados.length === 0) return { tipo: "NINGUNO" };
    if (marcados.length > 1) return { tipo: "AMBIGUO", cantidad: marcados.length };
    return { tipo: "UNO", destino: aDestino(marcados[0]!) };
  }

  async verificarArchivo(id: string, signal?: AbortSignal): Promise<DestinoConservadoZoom | null> {
    const archivo = await obtenerArchivoDrivePorId(this.deps.auth, id, { signal });
    return archivo && !archivo.trashed ? aDestino(archivo) : null;
  }
}
