import type { PrismaClient } from "@prisma/client";
import { obtenerConfiguracionCorreoSesActiva } from "../configuracion/correo-ses.service";
import { descifrarConfiguracion } from "@/src/lib/config/encryption";
import {
  reunionEmailText,
  type NotificationMessage,
  type NotificationRecipient,
  type ReunionEmailInput,
} from "./domain";
import {
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
    descifrar: descifrarConfiguracion,
  });
  const transport = crearCompositeEmailTransport(
    crearGmailEmailTransport(() => repository.obtenerCredencialesGmail()),
    crearSmtpEmailTransport(),
    crearSesV2EmailTransport(() => obtenerConfiguracionCorreoSesActiva(db))
  );
  return { repository, transport };
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

