import {
  descartarOperacionesNoBloqueantesLoteUseCase,
  descartarOperacionPendienteUseCase,
  reclasificarOperacionesPendientesLoteUseCase,
  sincronizarCohostsExistenteUseCase,
  configurarMeetExistenteUseCase,
  sincronizarEventosPendientesUseCase,
} from "./application";
import type {
  ConferenceProvisionRequest,
  ConferenceProvisionResult,
  DescartarLoteResult,
  DescartarOperacionResult,
  ProvisionConferenciaResult,
  ReclasificarLoteResult,
} from "./domain";
import { crearGoogleConferenceProvider } from "./infrastructure/google/google-conference-provider.adapter";
import type {
  ConferenceProvider,
  ConferenceProviderFactory,
  ConferenciasRepositoryPort,
} from "./ports";

export * from "./domain";
export * from "./ports";
export * from "./application";
export {
  crearGoogleConferenceProvider,
  compartirConferenciaGoogleCalendar,
  configurarGoogleMeetExistente,
  sincronizarCohostsGoogleExistente,
  consultarCohostsEspacioMeet,
  type ResultadoVerificacionEspacioMeet,
  type GoogleCalendarCredentials,
} from "./infrastructure/google/google-conference-provider.adapter";
export {
  crearPrismaConferenciasRepository,
  type PrismaConferenciasRepositoryOptions,
} from "./infrastructure/prisma/prisma-conferencias-repository.adapter";

export type ServicioConferencias = Readonly<{
  sincronizarEventosPendientes: (
    ids: readonly string[]
  ) => Promise<readonly ProvisionConferenciaResult[]>;

  sincronizarCohosts: (input: {
    organizerEmail: string;
    calendarId: string;
    externalEventId: string;
    codigoReunion?: string | null;
    cohostsAnteriores: readonly string[];
    cohostsDeseados: readonly string[];
  }) => Promise<Readonly<Record<string, unknown>>>;

  configurarMeetExistente: (
    organizerEmail: string,
    codigoReunion: string,
    settings: {
      requiereAsistenciaTecnica?: boolean;
      cohostEmails?: readonly string[];
    }
  ) => Promise<void>;

  descartarOperacionPendiente: (
    eventoProveedorId: string
  ) => Promise<DescartarOperacionResult>;

  descartarOperacionesNoBloqueantesLote: () => Promise<DescartarLoteResult>;

  reclasificarOperacionesPendientesLote: () => Promise<ReclasificarLoteResult>;

  crearProvider: ConferenceProviderFactory;
}>;

export function crearServicioConferencias(
  repository: ConferenciasRepositoryPort,
  providerFactory: ConferenceProviderFactory = crearGoogleConferenceProvider
): ServicioConferencias {
  return {
    async sincronizarEventosPendientes(ids) {
      return sincronizarEventosPendientesUseCase(repository, providerFactory, ids);
    },

    async sincronizarCohosts(input) {
      return sincronizarCohostsExistenteUseCase(repository, providerFactory, input);
    },

    async configurarMeetExistente(organizerEmail, codigoReunion, settings) {
      return configurarMeetExistenteUseCase(
        repository,
        providerFactory,
        organizerEmail,
        codigoReunion,
        settings
      );
    },

    async descartarOperacionPendiente(eventoProveedorId) {
      return descartarOperacionPendienteUseCase(repository, eventoProveedorId);
    },

    async descartarOperacionesNoBloqueantesLote() {
      return descartarOperacionesNoBloqueantesLoteUseCase(repository);
    },

    async reclasificarOperacionesPendientesLote() {
      return reclasificarOperacionesPendientesLoteUseCase(repository);
    },

    crearProvider: providerFactory,
  };
}

