export type MeetProvisionRequest = Readonly<{
  titulo: string;
  descripcion?: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  calendarId: string;
  cohostEmails?: readonly string[];
  requiereAsistencia?: boolean;
  requiereGrabacion?: boolean;
}>;

export type MeetProvisionResult = Readonly<{
  externalEventId: string;
  codigoReunion: string;
  joinUrl: string;
  payload: unknown;
  warning?: string;
}>;

export type MeetProvider = Readonly<{
  provisionarEvento: (
    request: MeetProvisionRequest,
  ) => Promise<MeetProvisionResult>;
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
