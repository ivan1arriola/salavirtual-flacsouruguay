export const TIPOS_NOTIFICACION = Object.freeze([
  "REUNION_CREADA",
  "ASISTENCIA_REQUERIDA",
  "ASISTENCIA_ASIGNACION",
  "ASISTENCIA_POSTULACION",
  "ASISTENCIA_POSTULACION_RETIRADA",
  "CREDENCIALES_SALA_CAMBIADAS",
  "HOST_NO_CONECTADO",
] as const);

export type TipoNotificacion = (typeof TIPOS_NOTIFICACION)[number];

export type PreferenciaCanales = Readonly<{
  push: boolean;
  email: boolean;
}>;

export const PREFERENCIA_PREDETERMINADA: PreferenciaCanales = Object.freeze({
  push: true,
  email: true,
});

export type NotificationRecipient = Readonly<{
  usuarioId: string;
  email?: string | null;
}>;

export type NotificationMessage = Readonly<{
  tipo: TipoNotificacion;
  titulo: string;
  cuerpo: string;
  href?: string;
  metadata?: unknown;
  emailSubject?: string;
  emailText?: string;
  emailHtml?: string;
  emailActionLabel?: string;
}>;

export type NotificationEmail = Readonly<{
  subject: string;
  text: string;
  html: string;
}>;

export type ReunionEmailInput = Readonly<{
  titulo: string;
  programa?: string | null;
  docente?: string | null;
  modalidad?: string | null;
  requiereAsistenciaTecnica?: boolean;
  requiereGrabacion?: boolean;
  anfitrionDesignado?: string | null;
  asistenteTecnico?: string | null;
  instancias: readonly Readonly<{
    inicio: string;
    fin: string;
    sala?: string | null;
    password?: string | null;
    meet?: string | null;
    joinUrl?: string | null;
  }>[];
}>;

export type MailInput = Readonly<{
  /** Stable notification-delivery ID when one has been persisted. */
  idempotencyKey?: string;
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  text: string;
  html?: string;
}>;

export type MailSendResult = Readonly<{
  sent: boolean;
  transport?: "GMAIL_API" | "SMTP";
  skipped?: "sin-destinatarios" | "correo-no-configurado";
  error?: string;
}>;

