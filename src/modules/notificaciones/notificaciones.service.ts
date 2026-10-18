import type { PrismaClient } from "@prisma/client";
import { obtenerConfiguracionCorreoSesActiva } from "../configuracion/correo-ses.service";
import {
  reunionEmailText,
  type NotificationMessage,
  type NotificationRecipient,
  type PreferenciaCanales,
  type ReunionEmailInput,
  type TipoNotificacion,
} from "./domain";
import {
  notificarAdministracionUseCase,
  notificarUsuariosUseCase,
  notificarUsuarioUseCase,
} from "./application";
import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearPrismaNotificacionesRepository,
  crearSmtpEmailTransport,
  crearSesV2EmailTransport,
} from "./infrastructure";

type Db = PrismaClient | Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

export type { NotificationMessage, NotificationRecipient, ReunionEmailInput };
export { reunionEmailText };

function buildScope(db: Db) {
  const repository = crearPrismaNotificacionesRepository({
    db,
    descifrar: (val) => val,
  });
  const transport = crearCompositeEmailTransport(
    crearGmailEmailTransport(() => repository.obtenerCredencialesGmail()),
    crearSmtpEmailTransport(),
    crearSesV2EmailTransport(() => obtenerConfiguracionCorreoSesActiva(db))
  );
  return { repository, transport };
}

export async function preferenciasDeUsuario(
  db: Db,
  usuarioId: string,
  tipo: TipoNotificacion
): Promise<PreferenciaCanales> {
  const { repository } = buildScope(db);
  return repository.obtenerPreferencias(usuarioId, tipo);
}

export async function notificarUsuario(
  db: Db,
  recipient: NotificationRecipient,
  message: NotificationMessage
): Promise<void> {
  const { repository, transport } = buildScope(db);
  return notificarUsuarioUseCase(
    repository,
    transport,
    recipient,
    message,
    process.env.APP_BASE_URL ?? "https://salavirtual.flacso.edu.uy"
  );
}

export async function notificarUsuarios(
  db: Db,
  recipients: readonly NotificationRecipient[],
  message: NotificationMessage
): Promise<void> {
  const { repository, transport } = buildScope(db);
  return notificarUsuariosUseCase(
    repository,
    transport,
    recipients,
    message,
    process.env.APP_BASE_URL ?? "https://salavirtual.flacso.edu.uy"
  );
}

export async function notificarAdministracion(
  db: Db,
  message: NotificationMessage
): Promise<void> {
  const { repository, transport } = buildScope(db);
  return notificarAdministracionUseCase(
    repository,
    transport,
    message,
    process.env.APP_BASE_URL ?? "https://salavirtual.flacso.edu.uy"
  );
}
