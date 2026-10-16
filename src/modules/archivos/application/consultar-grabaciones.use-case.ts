import type {
  ArchivoMeetVisibleModel,
  ArchivosRepositoryPort,
  EventoGrabacionPendienteModel,
  SessionActor
} from "../ports";
import type { ListarGrabacionesDbInput } from "../ports";

export async function listarArchivosVisiblesUseCase(
  repositorio: ArchivosRepositoryPort,
  actor: SessionActor
): Promise<readonly ArchivoMeetVisibleModel[]> {
  return repositorio.listarArchivosVisibles(actor);
}

export async function listarGrabacionesDbUseCase(repositorio: ArchivosRepositoryPort, actor: SessionActor, input: ListarGrabacionesDbInput) {
  if (!repositorio.listarGrabacionesDb) throw new Error("El repositorio no implementa paginación de encuentros.");
  return repositorio.listarGrabacionesDb(actor, input);
}

export async function listarGrabacionesPendientesVisiblesUseCase(
  repositorio: ArchivosRepositoryPort,
  actor: SessionActor,
  desde: Date,
  hasta: Date
): Promise<readonly EventoGrabacionPendienteModel[]> {
  return repositorio.listarGrabacionesPendientesVisibles(actor, desde, hasta);
}

export async function listarGrabacionesNoRealizadasVisiblesUseCase(
  repositorio: ArchivosRepositoryPort,
  actor: SessionActor,
  desde: Date,
  hasta: Date
): Promise<readonly EventoGrabacionPendienteModel[]> {
  return repositorio.listarGrabacionesNoRealizadasVisibles(actor, desde, hasta);
}

