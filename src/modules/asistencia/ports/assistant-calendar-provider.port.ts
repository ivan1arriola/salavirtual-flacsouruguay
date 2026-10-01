export type EventoCalendarioAsistente = Readonly<{
  id: string;
  titulo: string;
  descripcion: string | null;
  inicio: Date;
  fin: Date;
  reunionInicio: Date;
  reunionFin: Date;
  modalidad: "HIBRIDA" | "VIRTUAL";
  timezone: string;
  instanciaSalaId: string;
  programa: string | null;
  docente: string | null;
  joinUrl: string | null;
}>;

export type GoogleCalendarCredentials = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export type AssistantCalendarProvider = Readonly<{
  publicarEvento: (
    credentials: GoogleCalendarCredentials,
    event: EventoCalendarioAsistente
  ) => Promise<void>;
  eliminarEvento: (
    credentials: GoogleCalendarCredentials,
    eventId: string
  ) => Promise<void>;
}>;

