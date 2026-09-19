import type {
  DescartarLoteResult,
  DescartarOperacionResult,
} from "../domain/conferencias.types";
import type { ConferenciasRepositoryPort } from "../ports";

export async function descartarOperacionPendienteUseCase(
  repository: ConferenciasRepositoryPort,
  eventoProveedorId: string
): Promise<DescartarOperacionResult> {
  return repository.descartarOperacionPendiente(eventoProveedorId);
}

export async function descartarOperacionesNoBloqueantesLoteUseCase(
  repository: ConferenciasRepositoryPort
): Promise<DescartarLoteResult> {
  return repository.descartarOperacionesNoBloqueantesLote();
}

