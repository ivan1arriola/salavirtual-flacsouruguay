import type { PrismaClient } from "@prisma/client";
import type { GoogleCalendarCredentials } from "./google-calendar.adapter";
import type { MeetProvider } from "./provider";
import {
  crearPrismaConferenciasRepository,
  sincronizarEventosPendientesUseCase,
  type ProvisionConferenciaResult,
} from "@/src/modules/conferencias/api";

export type ProvisionDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  crearProvider: (credentials: GoogleCalendarCredentials) => MeetProvider;
}>;

export type ProvisionResult = ProvisionConferenciaResult;

export async function provisionarEventosMeet(
  dependencies: ProvisionDependencies,
  ids: readonly string[]
): Promise<readonly ProvisionResult[]> {
  return sincronizarEventosPendientes(dependencies, ids);
}

export async function sincronizarEventosPendientes(
  dependencies: ProvisionDependencies,
  ids: readonly string[]
): Promise<readonly ProvisionResult[]> {
  const repository = crearPrismaConferenciasRepository({
    db: dependencies.db,
    descifrarConfiguracion: dependencies.descifrar,
  });
  return sincronizarEventosPendientesUseCase(
    repository,
    dependencies.crearProvider,
    ids
  );
}
