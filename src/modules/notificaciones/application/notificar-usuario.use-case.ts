import { construirCorreoNotificacion, type NotificationMessage, type NotificationRecipient } from "../domain";
import type { EmailTransportPort, NotificacionesRepositoryPort } from "../ports";

export async function notificarUsuarioUseCase(
  repository: NotificacionesRepositoryPort,
  emailTransport: EmailTransportPort,
  recipient: NotificationRecipient,
  message: NotificationMessage,
  appBaseUrl = "https://salavirtual.flacso.edu.uy"
): Promise<void> {
  const asistenteCesado = await repository.esAsistenteCesado(recipient.usuarioId);
  if (asistenteCesado) {
    return;
  }

  const preference = await repository.obtenerPreferencias(recipient.usuarioId, message.tipo);

  let notificationId: string | void = undefined;
  if (preference.push) {
    notificationId = await repository.guardarNotificacionEnBandeja({
      usuarioId: recipient.usuarioId,
      tipo: message.tipo,
      titulo: message.titulo,
      cuerpo: message.cuerpo,
      href: message.href,
      metadata: message.metadata
    });
  }

  async function auditar(
    estado: "ACEPTADO" | "OMITIDO" | "ERROR",
    transporte?: "AMAZON_SES" | "GMAIL_API" | "SMTP",
    motivo?: string
  ) {
    try {
      await repository.registrarResultadoCorreo?.({
        usuarioId: recipient.usuarioId,
        ...(notificationId ? { notificacionId: notificationId } : {}),
        tipo: message.tipo,
        estado,
        ...(transporte ? { transporte } : {}),
        ...(motivo ? { motivo } : {})
      });
    } catch (error) {
      // La indisponibilidad de auditoría no reintenta el correo ni
      // interrumpe el flujo principal que disparó la notificación.
      console.error(
        "No se pudo auditar el resultado del correo",
        error instanceof Error ? error.name : "AuditError"
      );
    }
  }

  if (!preference.email) {
    return;
  }
  if (!recipient.email) {
    await auditar("OMITIDO", undefined, "sin-destinatario");
    return;
  }

  try {
    const email = construirCorreoNotificacion(message, appBaseUrl);
    const result = await emailTransport.enviarCorreo({
      ...(notificationId ? { idempotencyKey: notificationId } : {}),
      to: [recipient.email],
      subject: email.subject,
      text: email.text,
      html: email.html
    });

    if (result.sent) {
      // La API del proveedor aceptó el mensaje; no certifica su entrega.
      await auditar("ACEPTADO", result.transport);
    } else {
      const reason = result.skipped ?? (result.error ? "proveedor-no-confirmo" : "proveedor-no-confirmo");
      await auditar(result.skipped ? "OMITIDO" : "ERROR", result.transport, reason);
      console.warn("No se envió la notificación por correo", reason);
    }
  } catch (error) {
    // No almacenar detalles potencialmente sensibles del proveedor.
    const code = error instanceof Error ? error.name.replace(/[^A-Za-z0-9_]/g, "").slice(0, 80) : "Error";
    await auditar("ERROR", undefined, code || "Error");
    console.warn("No se pudo enviar notificación por correo", code || "Error");
  }
}
