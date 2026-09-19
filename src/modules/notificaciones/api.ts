import {
  enviarCorreoConfiguradoUseCase,
  notificarAdministracionUseCase,
  notificarUsuariosUseCase,
  notificarUsuarioUseCase,
} from "./application";
import type {
  MailInput,
  MailSendResult,
  NotificationMessage,
  NotificationRecipient,
} from "./domain";
import type {
  EmailTransportPort,
  NotificacionesRepositoryPort,
} from "./ports";

export * from "./domain";
export * from "./ports";
export * from "./application";
export * from "./infrastructure";

export type ServicioNotificaciones = Readonly<{
  notificarUsuario: (
    recipient: NotificationRecipient,
    message: NotificationMessage,
    appBaseUrl?: string
  ) => Promise<void>;

  notificarUsuarios: (
    recipients: readonly NotificationRecipient[],
    message: NotificationMessage,
    appBaseUrl?: string
  ) => Promise<void>;

  notificarAdministracion: (
    message: NotificationMessage,
    appBaseUrl?: string
  ) => Promise<void>;

  enviarCorreoConfigurado: (input: MailInput) => Promise<MailSendResult>;
}>;

export function crearServicioNotificaciones(
  repository: NotificacionesRepositoryPort,
  emailTransport: EmailTransportPort
): ServicioNotificaciones {
  return {
    notificarUsuario(recipient, message, appBaseUrl) {
      return notificarUsuarioUseCase(
        repository,
        emailTransport,
        recipient,
        message,
        appBaseUrl
      );
    },

    notificarUsuarios(recipients, message, appBaseUrl) {
      return notificarUsuariosUseCase(
        repository,
        emailTransport,
        recipients,
        message,
        appBaseUrl
      );
    },

    notificarAdministracion(message, appBaseUrl) {
      return notificarAdministracionUseCase(
        repository,
        emailTransport,
        message,
        appBaseUrl
      );
    },

    enviarCorreoConfigurado(input) {
      return enviarCorreoConfiguradoUseCase(emailTransport, input);
    },
  };
}

