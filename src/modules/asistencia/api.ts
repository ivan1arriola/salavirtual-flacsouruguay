import {
  actualizarDisponibilidadUseCase,
  actualizarPostulacionUseCase,
  asignarAsistenteUseCase,
  consultarAsistenciasPersonalesUseCase,
  consultarHistorialAsistenteUseCase,
  consultarSlugAsistenteUseCase,
  desvincularAsistenteUseCase,
  intentarSincronizacionCalendarioAsistente,
  reconciliarCalendariosAsistentesUseCase,
  renotificarAsistentesUseCase,
  reportarDuracionUseCase,
  sincronizarCalendarioAsistenteInstanciaUseCase,
  sincronizarCalendariosAsistenteSolicitudUseCase,
  sincronizarCalendariosAsistenteUsuarioUseCase,
  type SessionActor
} from "./application";
import type {
  IntentoSincronizacionCalendarioAsistente,
  ResultadoSincronizacionCalendarioAsistente
} from "./domain";
import { crearGoogleAssistantCalendarProvider } from "./infrastructure/google/google-assistant-calendar-provider.adapter";
import type {
  AsistenciaRepositoryPort,
  AssistantCalendarProvider,
  AssistantCalendarRepositoryPort
} from "./ports";

export * from "./domain";
export * from "./ports";
export * from "./application";
export { crearGoogleAssistantCalendarProvider } from "./infrastructure/google/google-assistant-calendar-provider.adapter";
export { crearPrismaAssistantCalendarRepository } from "./infrastructure/prisma/prisma-assistant-calendar-repository.adapter";
export { crearPrismaAsistenciaRepositoryAdapter } from "./infrastructure/prisma/prisma-asistencia-repository.adapter";

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

  reconciliarFuturas: (now?: Date) => Promise<readonly ResultadoSincronizacionCalendarioAsistente[]>;

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
      return sincronizarCalendarioAsistenteInstanciaUseCase(repository, provider, instanciaSalaId, now);
    },

    sincronizarSolicitud(solicitudSalaId, now) {
      return sincronizarCalendariosAsistenteSolicitudUseCase(repository, provider, solicitudSalaId, now);
    },

    sincronizarUsuario(usuarioId, now) {
      return sincronizarCalendariosAsistenteUsuarioUseCase(repository, provider, usuarioId, now);
    },

    reconciliarFuturas(now) {
      return reconciliarCalendariosAsistentesUseCase(repository, provider, now);
    },

    intentarSincronizacion(operation) {
      return intentarSincronizacionCalendarioAsistente(operation);
    }
  };
}

export type ServicioAsistenciaDeps = Readonly<{
  repo: AsistenciaRepositoryPort;
  notificarUsuarios?: (
    input: Readonly<{
      usuarioIds: readonly string[];
      asunto: string;
      mensaje: string;
    }>
  ) => Promise<unknown>;
}>;

export function crearServicioAsistencia(deps: ServicioAsistenciaDeps) {
  return {
    actualizarPostulacion(actor: SessionActor, rawInput: unknown) {
      return actualizarPostulacionUseCase({ repo: deps.repo }, actor, rawInput);
    },
    asignarAsistente(actor: SessionActor, rawInput: unknown) {
      return asignarAsistenteUseCase({ repo: deps.repo }, actor, rawInput);
    },
    desvincularAsistente(actor: SessionActor, rawInput: unknown) {
      return desvincularAsistenteUseCase({ repo: deps.repo }, actor, rawInput);
    },
    reportarDuracion(actor: SessionActor, rawInput: unknown, ahora?: Date) {
      return reportarDuracionUseCase({ repo: deps.repo }, actor, rawInput, ahora);
    },
    actualizarDisponibilidad(actor: SessionActor, rawInput: unknown) {
      return actualizarDisponibilidadUseCase({ repo: deps.repo }, actor, rawInput);
    },
    renotificarAsistentes(actor: SessionActor, rawInput: unknown) {
      return renotificarAsistentesUseCase(
        {
          repo: deps.repo,
          notificarUsuarios: deps.notificarUsuarios ?? (async () => {})
        },
        actor,
        rawInput
      );
    },
    consultarAsistenciasPersonales(usuarioId: string, periodo: "MES_ACTUAL" | "HISTORICO", ahora?: Date) {
      return consultarAsistenciasPersonalesUseCase({ repo: deps.repo }, usuarioId, periodo, ahora);
    },
    consultarHistorialAsistente(usuarioId: string, desde: Date, hasta: Date, limite?: number) {
      return consultarHistorialAsistenteUseCase({ repo: deps.repo }, usuarioId, desde, hasta, limite);
    },
    consultarSlugAsistente(usuarioId: string) {
      return consultarSlugAsistenteUseCase({ repo: deps.repo }, usuarioId);
    }
  };
}

export type ServicioAsistencia = ReturnType<typeof crearServicioAsistencia>;
