import {
  construirCorreoNotificacion,
  type NotificationMessage,
  type NotificationRecipient,
} from "../domain";
import type {
  EmailTransportPort,
  NotificacionesRepositoryPort,
} from "../ports";

export async function notificarUsuarioUseCase(
  repository: NotificacionesRepositoryPort,
  emailTransport: EmailTransportPort,
  recipient: NotificationRecipient,
  message: NotificationMessage,
  appBaseUrl = "https://salavirtual.flacso.edu.uy"
): Promise<void> {
  const asistenteCesado = await repository.esAsistenteCesado(recipient.usuarioId);
  if (asistenteCesado) return;

  const preference = await repository.obtenerPreferencias(
    recipient.usuarioId,
    message.tipo
  );

  let notificationId: string | void;
  if (preference.push) {
    notificationId = await repository.guardarNotificacionEnBandeja({
      usuarioId: recipient.usuarioId,
      tipo: message.tipo,
      titulo: message.titulo,
      cuerpo: message.cuerpo,
      href: message.href,
      metadata: message.metadata,
    });
  }

  if (preference.email && recipient.email) {
    try {
      const email = construirCorreoNotificacion(message, appBaseUrl);
      const result = await emailTransport.enviarCorreo({
        ...(notificationId ? { idempotencyKey: notificationId } : {}),
        to: [recipient.email],
        subject: email.subject,
        text: email.text,
        html: email.html,
      });

      if (!result.sent) {
        console.warn(
          "No se envió la notificación por correo",
          result.skipped ?? "motivo-desconocido"
        );
      }
    } catch (error) {
      console.warn("No se pudo enviar notificacion por correo", error);
    }
  }
}

