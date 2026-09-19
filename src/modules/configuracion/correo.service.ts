import type { PrismaClient } from "@prisma/client";
import {
  crearCompositeEmailTransport,
  crearGmailEmailTransport,
  crearSmtpEmailTransport,
  type MailInput,
  type MailSendResult,
} from "@/src/modules/notificaciones/api";
import { descifrarConfiguracion } from "../../lib/config/encryption";

type ConfigurationDb = Pick<PrismaClient, "configuracionGoogleWorkspace">;

export async function enviarCorreoConfigurado(
  db: ConfigurationDb,
  input: MailInput
): Promise<MailSendResult> {
  const gmailTransport = crearGmailEmailTransport(async () => {
    const configuration = await db.configuracionGoogleWorkspace.findUnique({
      where: { id: "principal" },
      select: {
        serviceAccountEmail: true,
        privateKeyCifrada: true,
        serviceAccountSubject: true,
        activa: true,
      },
    });

    if (
      !configuration?.activa ||
      !configuration.serviceAccountEmail ||
      !configuration.privateKeyCifrada ||
      !configuration.serviceAccountSubject
    ) {
      return null;
    }

    return {
      serviceAccountEmail: configuration.serviceAccountEmail,
      privateKey: descifrarConfiguracion(configuration.privateKeyCifrada),
      subject: configuration.serviceAccountSubject,
    };
  });

  const smtpTransport = crearSmtpEmailTransport();
  const transport = crearCompositeEmailTransport(gmailTransport, smtpTransport);

  return transport.enviarCorreo(input);
}
