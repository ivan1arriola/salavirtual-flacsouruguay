import type { ConferenceProvisionRequest, ConferenceProvisionResult } from "../domain/conferencias.types";

export type ZoomProviderCredentials = Readonly<{
  accountId: string;
  clientId: string;
  clientSecret: string;
}>;

/** Resultado de aplicar alternative hosts: Zoom solo acepta usuarios de la propia cuenta. */
export type ZoomCohostsAplicados = Readonly<{
  aplicados: readonly string[];
  rechazados: readonly string[];
}>;

/**
 * Puerto de aprovisionamiento Zoom. A diferencia de Meet no hay evento
 * Calendar intermedio: externalEventId y codigoReunion son el meeting ID.
 */
export type ZoomConferenceProvider = Readonly<{
  crearReunion: (
    hostEmail: string,
    request: ConferenceProvisionRequest
  ) => Promise<Readonly<{ externalEventId: string; payload: unknown }>>;
  obtenerReunion: (externalEventId: string) => Promise<ConferenceProvisionResult | null>;
  actualizarReunion: (
    externalEventId: string,
    request: ConferenceProvisionRequest
  ) => Promise<void>;
  configurarCohosts: (
    externalEventId: string,
    hostEmail: string,
    cohostEmails: readonly string[]
  ) => Promise<ZoomCohostsAplicados>;
  cancelarReunion: (externalEventId: string) => Promise<void>;
}>;

export type ZoomConferenceProviderFactory = (credentials: ZoomProviderCredentials) => ZoomConferenceProvider;

export type ZoomCredentialsResult = Readonly<{
  disponible: boolean;
  credentials?: ZoomProviderCredentials;
  error?: string;
}>;
