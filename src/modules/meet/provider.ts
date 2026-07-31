export type MeetProvisionRequest = {
  titulo: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  calendarId: string;
};

export type MeetProvisionResult = {
  externalEventId: string;
  joinUrl: string;
  payload: unknown;
};

export interface MeetProvider {
  provisionarEvento(request: MeetProvisionRequest): Promise<MeetProvisionResult>;
  cancelarEvento(externalEventId: string): Promise<void>;
}
