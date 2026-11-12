import type { ConferenceProvisionRequest, ConferenceProvisionResult } from "../domain/conferencias.types";

export type ConferenceProvider = Readonly<{
  crearEventoCalendar: (
    request: ConferenceProvisionRequest
  ) => Promise<Readonly<{ externalEventId: string; payload: unknown }>>;
  obtenerEvento: (calendarId: string, externalEventId: string) => Promise<ConferenceProvisionResult | null>;
  configurarEventoMeet: (
    request: ConferenceProvisionRequest,
    evento: ConferenceProvisionResult
  ) => Promise<void>;
  cancelarEvento: (calendarId: string, externalEventId: string) => Promise<void>;
  actualizarEvento: (
    calendarId: string,
    externalEventId: string,
    request: Omit<ConferenceProvisionRequest, "calendarId">
  ) => Promise<void>;
  compartirConferenciaCalendar?: (
    calendarId: string,
    externalEventId: string,
    conferenceData: Readonly<Record<string, unknown>>
  ) => Promise<ConferenceProvisionResult>;
  configurarMeetExistente?: (
    codigoReunion: string,
    settings: Readonly<{ requiereAsistenciaTecnica?: boolean; cohostEmails?: readonly string[] }>
  ) => Promise<void>;
  sincronizarCohostsExistente?: (
    input: Readonly<{
      calendarId: string;
      externalEventId: string;
      codigoReunion?: string | null;
      cohostsAnteriores: readonly string[];
      cohostsDeseados: readonly string[];
    }>
  ) => Promise<Readonly<Record<string, unknown>>>;
}>;

export type ConferenceProviderFactory = (
  credentials: Readonly<{ serviceAccountEmail: string; privateKey: string; subject: string }>
) => ConferenceProvider;
