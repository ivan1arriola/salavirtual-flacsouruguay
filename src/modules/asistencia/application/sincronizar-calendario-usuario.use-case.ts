import type { ResultadoSincronizacionCalendarioAsistente } from "../domain";
import type { AssistantCalendarProvider, AssistantCalendarRepositoryPort } from "../ports";
import { sincronizarCalendarioAsistenteInstanciaUseCase } from "./sincronizar-calendario-instancia.use-case";

export async function sincronizarCalendariosAsistenteUsuarioUseCase(
  repository: AssistantCalendarRepositoryPort,
  provider: AssistantCalendarProvider,
  usuarioId: string,
  now = new Date()
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const instances = await repository.obtenerInstanciasDeAsistente(usuarioId);
  const results = await Promise.all(
    instances.map((id) => sincronizarCalendarioAsistenteInstanciaUseCase(repository, provider, id, now))
  );
  return results.flat();
}
