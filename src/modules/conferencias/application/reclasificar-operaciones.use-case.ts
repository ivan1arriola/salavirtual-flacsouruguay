import type { ReclasificarLoteResult } from "../domain";
import type { ConferenciasRepositoryPort } from "../ports";

export async function reclasificarOperacionesPendientesLoteUseCase(
  repository: ConferenciasRepositoryPort,
): Promise<ReclasificarLoteResult> {
  if (!repository.reclasificarOperacionesPendientesLote) {
    throw new Error("El repositorio de conferencias no soporta reclasificación por lote.");
  }
  return repository.reclasificarOperacionesPendientesLote();
}
