import type {
  NotificationMessage,
  NotificationRecipient,
} from "../domain";
import type {
  EmailTransportPort,
  NotificacionesRepositoryPort,
} from "../ports";
import { notificarUsuarioUseCase } from "./notificar-usuario.use-case";

export async function notificarUsuariosUseCase(
  repository: NotificacionesRepositoryPort,
  emailTransport: EmailTransportPort,
  recipients: readonly NotificationRecipient[],
  message: NotificationMessage,
  appBaseUrl = "https://salavirtual.flacso.edu.uy"
): Promise<void> {
  const programRecipients = await destinatariosProgramaParaNotificacion(
    repository,
    message
  );

  const uniqueRecipients = Array.from(
    new Map(
      [...recipients, ...programRecipients].map((recipient) => [
        recipient.usuarioId,
        recipient,
      ])
    ).values()
  );

  await Promise.all(
    uniqueRecipients.map((recipient) =>
      notificarUsuarioUseCase(
        repository,
        emailTransport,
        recipient,
        message,
        appBaseUrl
      )
    )
  );
}

async function destinatariosProgramaParaNotificacion(
  repository: NotificacionesRepositoryPort,
  message: NotificationMessage
): Promise<readonly NotificationRecipient[]> {
  if (
    message.tipo !== "REUNION_CREADA" &&
    message.tipo !== "ASISTENCIA_ASIGNACION"
  ) {
    return [];
  }

  const solicitudId = message.href?.match(/^\/reuniones\/([^/?#]+)/)?.[1];
  if (!solicitudId) return [];

  return repository.obtenerDestinatariosDocentesPrograma(solicitudId);
}

