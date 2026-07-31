export type MeetProvisionRequest = Readonly<{
  titulo: string;
  descripcion?: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  calendarId: string;
}>;

export type MeetProvisionResult = Readonly<{
  externalEventId: string;
  codigoReunion: string;
  joinUrl: string;
  payload: unknown;
}>;

export type MeetProvider = Readonly<{
  provisionarEvento: (
    request: MeetProvisionRequest,
  ) => Promise<MeetProvisionResult>;
  cancelarEvento: (
    calendarId: string,
    externalEventId: string,
  ) => Promise<void>;
}>;
