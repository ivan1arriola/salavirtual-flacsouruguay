import type { ArchivoMeetVisibleModel, ArchivosRepositoryPort, SessionActor } from "../ports";
import type { ListarGrabacionesDbInput } from "../ports";

export async function listarArchivosVisiblesUseCase(
  repositorio: ArchivosRepositoryPort,
  actor: SessionActor,
): Promise<readonly ArchivoMeetVisibleModel[]> {
  return repositorio.listarArchivosVisibles(actor);
}

export async function listarGrabacionesDbUseCase(
  repositorio: ArchivosRepositoryPort,
  actor: SessionActor,
  input: ListarGrabacionesDbInput,
) {
  if (!repositorio.listarGrabacionesDb) {
    throw new Error("El repositorio no implementa paginación de encuentros.");
  }
  return repositorio.listarGrabacionesDb(actor, input);
}
