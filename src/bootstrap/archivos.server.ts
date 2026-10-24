import "server-only";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import {
  crearGoogleArtifactsProviderAdapter,
  crearPrismaArchivosRepositoryAdapter,
  listarArchivosVisiblesUseCase,
  listarGrabacionesDbUseCase,
  obtenerParticipantesActivosUseCase,
  repararPlanillasAsistenciaVaciasUseCase,
  sincronizarArtefactosUseCase,
  seleccionarLoteEventosOperativosUseCase,
  type ArchivoMeetVisibleModel,
  type ArtifactProviderCredentials,
  type ArtifactProviderPort,
  type LiveParticipantsResult,
  type SessionActor,
  type SyncArtifactsResult
} from "@/src/modules/archivos/api";

export function crearArchivosRepository() {
  return crearPrismaArchivosRepositoryAdapter(db);
}

export function crearArtifactProvider(
  credentials: ArtifactProviderCredentials
): ArtifactProviderPort {
  return crearGoogleArtifactsProviderAdapter(credentials);
}

export async function sincronizarArtefactos(
  eventoProveedorIds: readonly string[],
  regenerarAsistencia = false
): Promise<readonly SyncArtifactsResult[]> {
  const repository = crearArchivosRepository();
  return sincronizarArtefactosUseCase(
    repository,
    crearArtifactProvider,
    descifrarConfiguracion,
    { eventoProveedorIds, regenerarAsistencia }
  );
}

export async function repararPlanillasAsistenciaVacias(eventoProveedorIds?: readonly string[]) {
  return repararPlanillasAsistenciaVaciasUseCase(
    crearArchivosRepository(),
    crearArtifactProvider,
    descifrarConfiguracion,
    eventoProveedorIds
  );
}

export async function sincronizarArtefactosOperativos(ahora = new Date()) {
  const repository = crearArchivosRepository();
  const lote = await seleccionarLoteEventosOperativosUseCase(repository, ahora);
  const resultados = await sincronizarArtefactosUseCase(
    repository,
    crearArtifactProvider,
    descifrarConfiguracion,
    { eventoProveedorIds: lote.eventoProveedorIds }
  );
  return { ...lote, resultados, timestamp: ahora.toISOString() };
}

export async function obtenerParticipantesActivosInstancia(
  instanciaId: string
): Promise<LiveParticipantsResult> {
  const repository = crearArchivosRepository();
  return obtenerParticipantesActivosUseCase(
    repository,
    crearArtifactProvider,
    descifrarConfiguracion,
    instanciaId
  );
}

export async function listarArchivosMeetVisibles(
  actor: SessionActor
): Promise<readonly ArchivoMeetVisibleModel[]> {
  const repository = crearArchivosRepository();
  return listarArchivosVisiblesUseCase(repository, actor);
}

export async function listarGrabacionesDb(actor: SessionActor, input: { pagina: number; busqueda: string; filtro: import("@/src/modules/archivos/domain").TipoFiltroArtefacto }) {
  return listarGrabacionesDbUseCase(crearArchivosRepository(), actor, input);
}

