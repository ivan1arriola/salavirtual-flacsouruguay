import type { NotificationMessage } from "../domain";
import type {
  EmailTransportPort,
  NotificacionesRepositoryPort,
} from "../ports";
import { notificarUsuariosUseCase } from "./notificar-usuarios.use-case";

export async function notificarAdministracionUseCase(
  repository: NotificacionesRepositoryPort,
  emailTransport: EmailTransportPort,
  message: NotificationMessage,
  appBaseUrl = "https://salavirtual.flacso.edu.uy"
): Promise<void> {
  const admins = await repository.obtenerAdministradoresActivos();
  await notificarUsuariosUseCase(
    repository,
    emailTransport,
    admins,
    message,
    appBaseUrl
  );
}

