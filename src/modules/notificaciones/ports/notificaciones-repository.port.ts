import type {
  NotificationRecipient,
  PreferenciaCanales,
  TipoNotificacion,
} from "../domain";

export type CredencialGmailTransport = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export type NotificacionesRepositoryPort = Readonly<{
  obtenerPreferencias: (
    usuarioId: string,
    tipo: TipoNotificacion
  ) => Promise<PreferenciaCanales>;

  guardarNotificacionEnBandeja: (data: {
    usuarioId: string;
    tipo: TipoNotificacion;
    titulo: string;
    cuerpo: string;
    href?: string;
    metadata?: unknown;
  }) => Promise<string | void>;

  esAsistenteCesado: (usuarioId: string) => Promise<boolean>;

  obtenerDestinatariosDocentesPrograma: (
    solicitudId: string
  ) => Promise<readonly NotificationRecipient[]>;


  obtenerCredencialesGmail: () => Promise<CredencialGmailTransport | null>;

  /** Aceptado por el proveedor no equivale a entregado al buzón. */
  registrarResultadoCorreo?: (resultado: Readonly<{
    usuarioId: string;
    notificacionId?: string;
    tipo: TipoNotificacion;
    estado: "ACEPTADO" | "OMITIDO" | "ERROR";
    transporte?: "AMAZON_SES" | "GMAIL_API" | "SMTP";
    motivo?: string;
  }>) => Promise<void>;
}>;

