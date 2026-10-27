import "server-only";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import { db } from "@/src/lib/db";
import { obtenerCredencialZoom } from "@/src/modules/configuracion/api";
import {
  crearGoogleArtifactsProviderAdapter,
  crearZoomArtifactsProviderAdapter,
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
  type TipoProveedorArtefactos,
  type LiveParticipantsResult,
  type SessionActor,
  type SyncArtifactsResult
} from "@/src/modules/archivos/api";

export function crearArchivosRepository() {
  return crearPrismaArchivosRepositoryAdapter(db);
}

export function crearArtifactProvider(
  credentials: ArtifactProviderCredentials,
  tipoProveedor: TipoProveedorArtefactos = "GOOGLE_MEET"
): ArtifactProviderPort {
  if (tipoProveedor !== "ZOOM") return crearGoogleArtifactsProviderAdapter(credentials);

  // El host Zoom puede no ser un usuario de Workspace: Drive y Sheets se
  // escriben con la identidad administrativa configurada.
  const googleDrive = {
    serviceAccountEmail: credentials.serviceAccountEmail,
    privateKey: credentials.privateKey,
    subject: credentials.adminEmail?.trim() || credentials.subject,
  };
  return crearZoomArtifactsProviderAdapter({
    obtenerCredencialesZoom: () => obtenerCredencialZoom(db, descifrarConfiguracion),
    google: crearGoogleArtifactsProviderAdapter(googleDrive),
    googleDrive,
  });
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

