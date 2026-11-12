import type { PrismaClient } from "@prisma/client";
import type {
  AssistantCalendarProvider,
  AssistantCalendarRepositoryPort,
  EventoCalendarioAsistente,
  GoogleCalendarCredentials
} from "./ports";
import type { ResultadoSincronizacionCalendarioAsistente } from "./domain";
import {
  sincronizarCalendarioAsistenteInstanciaUseCase,
  sincronizarCalendariosAsistenteSolicitudUseCase,
  sincronizarCalendariosAsistenteUsuarioUseCase,
  reconciliarCalendariosAsistentesUseCase
} from "./application";
import { crearPrismaAssistantCalendarRepository } from "./infrastructure/prisma/prisma-assistant-calendar-repository.adapter";

export type { ResultadoSincronizacionCalendarioAsistente };
export { hayErroresSincronizacionCalendarioAsistente } from "./domain";

export type SincronizacionCalendarioAsistenteDependencies = Readonly<{
  db: PrismaClient;
  descifrar: (value: string) => string;
  publicarEvento: (credentials: GoogleCalendarCredentials, event: EventoCalendarioAsistente) => Promise<void>;
  eliminarEvento: (credentials: GoogleCalendarCredentials, eventId: string) => Promise<void>;
}>;

function buildAdapters(dependencies: SincronizacionCalendarioAsistenteDependencies): {
  repository: AssistantCalendarRepositoryPort;
  provider: AssistantCalendarProvider;
} {
  const repository = crearPrismaAssistantCalendarRepository({
    db: dependencies.db,
    descifrar: dependencies.descifrar
  });
  const provider: AssistantCalendarProvider = {
    publicarEvento: dependencies.publicarEvento,
    eliminarEvento: dependencies.eliminarEvento
  };
  return { repository, provider };
}

export async function sincronizarCalendarioAsistenteInstancia(
  dependencies: SincronizacionCalendarioAsistenteDependencies,
  instanciaSalaId: string
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const { repository, provider } = buildAdapters(dependencies);
  return sincronizarCalendarioAsistenteInstanciaUseCase(repository, provider, instanciaSalaId);
}

export async function sincronizarCalendariosAsistenteSolicitud(
  dependencies: SincronizacionCalendarioAsistenteDependencies,
  solicitudSalaId: string
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const { repository, provider } = buildAdapters(dependencies);
  return sincronizarCalendariosAsistenteSolicitudUseCase(repository, provider, solicitudSalaId);
}

export async function sincronizarCalendariosAsistenteUsuario(
  dependencies: SincronizacionCalendarioAsistenteDependencies,
  usuarioId: string
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const { repository, provider } = buildAdapters(dependencies);
  return sincronizarCalendariosAsistenteUsuarioUseCase(repository, provider, usuarioId);
}

export async function reconciliarCalendariosAsistentes(
  dependencies: SincronizacionCalendarioAsistenteDependencies,
  now = new Date()
): Promise<readonly ResultadoSincronizacionCalendarioAsistente[]> {
  const { repository, provider } = buildAdapters(dependencies);
  return reconciliarCalendariosAsistentesUseCase(repository, provider, now);
}
