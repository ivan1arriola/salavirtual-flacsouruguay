import {
  intentarSincronizacionCalendarioAsistente,
  reconciliarCalendariosAsistentesUseCase,
  sincronizarCalendarioAsistenteInstanciaUseCase,
  sincronizarCalendariosAsistenteSolicitudUseCase,
  sincronizarCalendariosAsistenteUsuarioUseCase,
} from "./application";
import type {
  IntentoSincronizacionCalendarioAsistente,
  ResultadoSincronizacionCalendarioAsistente,
} from "./domain";
import { crearGoogleAssistantCalendarProvider } from "./infrastructure/google/google-assistant-calendar-provider.adapter";
import type {
  AssistantCalendarProvider,
  AssistantCalendarRepositoryPort,
} from "./ports";

export * from "./domain";
export * from "./ports";
export * from "./application";
export {
  crearGoogleAssistantCalendarProvider,
  publicarEventoCalendarioAsistente,
  eliminarEventoCalendarioAsistente,
} from "./infrastructure/google/google-assistant-calendar-provider.adapter";
export {
  crearPrismaAssistantCalendarRepository,
  type PrismaAssistantCalendarRepositoryOptions,
} from "./infrastructure/prisma/prisma-assistant-calendar-repository.adapter";

export type ServicioCalendarioAsistente = Readonly<{
  sincronizarInstancia: (
    instanciaSalaId: string,
    now?: Date
  ) => Promise<readonly ResultadoSincronizacionCalendarioAsistente[]>;

  sincronizarSolicitud: (
    solicitudSalaId: string,
    now?: Date
  ) => Promise<readonly ResultadoSincronizacionCalendarioAsistente[]>;

  sincronizarUsuario: (
    usuarioId: string,
    now?: Date
  ) => Promise<readonly ResultadoSincronizacionCalendarioAsistente[]>;

  reconciliarFuturas: (
    now?: Date
  ) => Promise<readonly ResultadoSincronizacionCalendarioAsistente[]>;

  intentarSincronizacion: (
    operation: () => Promise<readonly ResultadoSincronizacionCalendarioAsistente[]>
  ) => Promise<IntentoSincronizacionCalendarioAsistente>;
}>;

export function crearServicioCalendarioAsistente(
  repository: AssistantCalendarRepositoryPort,
  provider: AssistantCalendarProvider = crearGoogleAssistantCalendarProvider()
): ServicioCalendarioAsistente {
  return {
    sincronizarInstancia(instanciaSalaId, now) {
      return sincronizarCalendarioAsistenteInstanciaUseCase(
        repository,
        provider,
        instanciaSalaId,
        now
      );
    },

    sincronizarSolicitud(solicitudSalaId, now) {
      return sincronizarCalendariosAsistenteSolicitudUseCase(
        repository,
        provider,
        solicitudSalaId,
        now
      );
    },

    sincronizarUsuario(usuarioId, now) {
      return sincronizarCalendariosAsistenteUsuarioUseCase(
        repository,
        provider,
        usuarioId,
        now
      );
    },

    reconciliarFuturas(now) {
      return reconciliarCalendariosAsistentesUseCase(repository, provider, now);
    },

    intentarSincronizacion(operation) {
      return intentarSincronizacionCalendarioAsistente(operation);
    },
  };
}

