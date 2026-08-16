export type MeetProvisionRequest = Readonly<{
  titulo: string;
  descripcion?: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  calendarId: string;
  /** Conference data from another Calendar event when a series shares one Meet space. */
  conferenceData?: Readonly<Record<string, unknown>>;
  cohostEmails?: readonly string[];
  requiereAsistenciaTecnica?: boolean;
  /** Stable event id supplied by the application for retry-safe Calendar POSTs. */
  calendarEventId?: string;
}>;

export type MeetProvisionResult = Readonly<{
  externalEventId: string;
  codigoReunion: string;
  joinUrl: string;
  payload: unknown;
  warning?: string;
}>;

export type MeetProvider = Readonly<{
  crearEventoCalendar: (request: MeetProvisionRequest) => Promise<Readonly<{ externalEventId: string; payload: unknown }>>;
  obtenerEvento: (calendarId: string, externalEventId: string) => Promise<MeetProvisionResult | null>;
  configurarEventoMeet: (request: MeetProvisionRequest, evento: MeetProvisionResult) => Promise<void>;
  cancelarEvento: (
    calendarId: string,
    externalEventId: string,
  ) => Promise<void>;
  actualizarEvento: (
    calendarId: string,
    externalEventId: string,
    request: Omit<MeetProvisionRequest, "calendarId">
  ) => Promise<void>;
}>;
