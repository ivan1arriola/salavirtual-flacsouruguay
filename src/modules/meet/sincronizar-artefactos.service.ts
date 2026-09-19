import type { PrismaClient } from "@prisma/client";
import {
  crearPrismaArchivosRepositoryAdapter,
  sincronizarArtefactosUseCase,
  type EstadoResultadoGrabacion,
  type SyncArtifactsResult
} from "@/src/modules/archivos/api";
import type {
  crearGoogleMeetArtifactsClient
} from "./google-meet-artifacts.adapter";

export type { EstadoResultadoGrabacion, SyncArtifactsResult };

type ArtifactsClient = ReturnType<typeof crearGoogleMeetArtifactsClient>;

export type SyncArtifactsDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearClient: (credentials: Readonly<{
    serviceAccountEmail: string;
    privateKey: string;
    subject: string;
  }>) => ArtifactsClient;
}>;

export async function sincronizarArtefactosMeet(
  dependencies: SyncArtifactsDependencies,
  eventoProveedorIds: readonly string[]
): Promise<readonly SyncArtifactsResult[]> {
  const repository = crearPrismaArchivosRepositoryAdapter(dependencies.db);
  return sincronizarArtefactosUseCase(
    repository,
    (credentials) => dependencies.crearClient(credentials),
    dependencies.descifrar,
    { eventoProveedorIds }
  );
}
