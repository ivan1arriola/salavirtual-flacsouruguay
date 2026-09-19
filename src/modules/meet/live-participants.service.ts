import type { PrismaClient } from "@prisma/client";
import {
  crearPrismaArchivosRepositoryAdapter,
  obtenerParticipantesActivosUseCase,
  type LiveParticipantsResult,
  type MeetArtifactCredentials,
  type ParticipanteActivoMeet
} from "@/src/modules/archivos/api";

type LiveParticipantsClient = Readonly<{
  obtenerParticipantesActivos: (
    codigo: string,
    inicio: Date,
    fin: Date
  ) => Promise<{
    conferenciaExiste: boolean;
    conferenceName?: string;
    participantesActivos: readonly ParticipanteActivoMeet[];
  }>;
}>;

type LiveParticipantsDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearClient: (credentials: MeetArtifactCredentials) => LiveParticipantsClient;
}>;

export type { LiveParticipantsResult };

export async function obtenerParticipantesActivosInstancia(
  deps: LiveParticipantsDependencies,
  instanciaId: string
): Promise<LiveParticipantsResult> {
  const repository = crearPrismaArchivosRepositoryAdapter(deps.db);
  return obtenerParticipantesActivosUseCase(
    repository,
    (cred) => deps.crearClient(cred) as never,
    deps.descifrar,
    instanciaId
  );
}
