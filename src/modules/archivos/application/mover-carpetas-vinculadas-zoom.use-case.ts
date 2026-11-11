import type { HashZoom, ReferenciaOcurrenciaZoom } from "../domain";
import type { ArchivoStoragePort } from "../ports";
import { resolverCarpetaMesZoom } from "./resolver-carpeta-zoom";

export type CarpetaPorMoverZoom = Readonly<{
  ocurrenciaId: string;
  driveFolderId: string;
  referencia: Pick<ReferenciaOcurrenciaZoom, "inicioRealAt">;
}>;

export type RepoMoverCarpetasZoom = Readonly<{
  /** Ocurrencias vinculadas a un encuentro con carpeta de Drive y sin verificar bajo la raíz de vinculados. */
  listarCarpetasPorMover(limite: number): Promise<readonly CarpetaPorMoverZoom[]>;
  marcarCarpetaVinculada(ocurrenciaId: string, ahora: Date): Promise<boolean>;
}>;

export type ResumenMoverCarpetasZoom = Readonly<{
  movidas: number;
  yaEnDestino: number;
  noEncontradas: number;
  fallidas: number;
  /** No hay carpeta raíz de grabaciones vinculadas: no existe un destino seguro y no se mueve nada. */
  sinRaiz: boolean;
}>;

/**
 * Lleva a la raíz de grabaciones vinculadas (AAAA/MM) la carpeta de cada ocurrencia que ya tiene encuentro,
 * para que sus archivos hereden el acceso del encuentro. Conserva los IDs de Drive (se mueve la carpeta, no se
 * copian archivos), es idempotente y un fallo en una carpeta no impide las demás.
 */
export async function moverCarpetasVinculadasZoomUseCase(
  deps: Readonly<{
    repo: RepoMoverCarpetasZoom;
    storage: Pick<ArchivoStoragePort, "asegurarCarpeta" | "moverCarpeta">;
    hash: HashZoom;
    raizVinculados: string | null;
    ahora: () => Date;
  }>,
  opciones: Readonly<{ limite: number; signal?: AbortSignal }>
): Promise<ResumenMoverCarpetasZoom> {
  if (!deps.raizVinculados) return { movidas: 0, yaEnDestino: 0, noEncontradas: 0, fallidas: 0, sinRaiz: true };
  let movidas = 0;
  let yaEnDestino = 0;
  let noEncontradas = 0;
  let fallidas = 0;
  for (const carpeta of await deps.repo.listarCarpetasPorMover(opciones.limite)) {
    try {
      const destino = await resolverCarpetaMesZoom(deps.storage, deps.hash, carpeta.referencia.inicioRealAt, deps.raizVinculados);
      const r = await deps.storage.moverCarpeta(carpeta.driveFolderId, destino, opciones.signal);
      if (r === "NO_ENCONTRADO") { noEncontradas++; continue; }
      await deps.repo.marcarCarpetaVinculada(carpeta.ocurrenciaId, deps.ahora());
      if (r === "MOVIDA") movidas++; else yaEnDestino++;
    } catch {
      // Sin detalle: el mensaje podría traer URLs. La carpeta queda sin marcar y se reintenta en el próximo ciclo.
      fallidas++;
    }
  }
  return { movidas, yaEnDestino, noEncontradas, fallidas, sinRaiz: false };
}
