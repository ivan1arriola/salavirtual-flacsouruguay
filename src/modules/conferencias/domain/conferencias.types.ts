export type ConferenceProvisionRequest = Readonly<{
  titulo: string;
  descripcion?: string;
  inicio: Date;
  fin: Date;
  timezone: string;
  calendarId: string;
  conferenceData?: Readonly<Record<string, unknown>>;
  cohostEmails?: readonly string[];
  guestEmails?: readonly string[];
  requiereAsistenciaTecnica?: boolean;
  calendarEventId: string;
}>;

export type ConferenceProvisionResult = Readonly<{
  externalEventId: string;
  codigoReunion: string;
  joinUrl: string;
  payload: unknown;
  warning?: string;
}>;

export type EstadoIntegracionConferencia =
  | "PENDIENTE"
  | "SINCRONIZADA"
  | "ERROR"
  | "HISTORICA";

export type OperacionPendienteConferencia =
  | "PROVISIONAR"
  | "REPROGRAMAR"
  | "CONFIGURAR_MEET"
  | "CANCELAR";

export type IntegracionConferenciaHealth = Readonly<{
  estadoIntegracion: EstadoIntegracionConferencia;
  joinUrl?: string | null;
  codigoReunion?: string | null;
  errorIntegracion?: string | null;
}>;

export type DetalleCohostsVerificados = Readonly<{
  confirmados: boolean;
  emailsConfirmados: readonly string[];
  emailsPendientes: readonly string[];
}>;

export type ProvisionResultStatus =
  | "SINCRONIZADA"
  | "ERROR"
  | "PENDIENTE_CONFIGURACION"
  | "EN_PROCESO"
  | "REQUIERE_REVISION";

export type ProvisionConferenciaResult = Readonly<{
  eventoProveedorId: string;
  estado: ProvisionResultStatus;
  codigoReunion?: string;
  error?: string;
}>;

export type DescartarOperacionResult = Readonly<{
  eventoProveedorId: string;
  descartada: boolean;
  motivo?: string;
}>;

export type DescartarLoteResult = Readonly<{
  totalDescartadas: number;
}>;

export type ReclasificarLoteResult = Readonly<{
  totalReclasificadas: number;
}>;

