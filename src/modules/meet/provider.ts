export type MeetProvisionRequest = Readonly<{
  titulo: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  calendarId: string;
}>;

export type MeetProvisionResult = Readonly<{
  externalEventId: string;
  joinUrl: string;
  payload: unknown;
}>;

export type MeetProvider = Readonly<{
  provisionarEvento: (request: MeetProvisionRequest) => Promise<MeetProvisionResult>;
  cancelarEvento: (externalEventId: string) => Promise<void>;
}>;
