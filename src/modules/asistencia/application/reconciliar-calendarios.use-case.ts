import type { ResultadoSincronizacionCalendarioAsistente } from "../domain";
import type {
  AssistantCalendarProvider,
  AssistantCalendarRepositoryPort,
} from "../ports";
import { sincronizarCalendarioAsistenteInstanciaUseCase } from "./sincronizar-calendario-instancia.use-case";

export async function reconciliarCalendariosAsistentesUseCase(
  repository: AssistantCalendarRepositoryPort,
  provider: AssistantCalendarProvider,
  now = new Date()
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const instances = await repository.obtenerInstanciasFuturasParaReconciliar(now);
  const results = await Promise.all(
    instances.map((id) =>
      sincronizarCalendarioAsistenteInstanciaUseCase(repository, provider, id, now)
    )
  );
  return results.flat();
}

