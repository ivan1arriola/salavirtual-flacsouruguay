import type { PrismaClient } from "@prisma/client";
import {
  type GmailMailCredential,
  type MailInput,
  type MailSendResult,
  sendMail
} from "../../lib/email.client";

type ConfigurationDb = Pick<PrismaClient, "configuracionGoogleWorkspace">;

export async function enviarCorreoConfigurado(
  db: ConfigurationDb,
  input: MailInput
): Promise<MailSendResult> {
  const configuration = await db.configuracionGoogleWorkspace.findUnique({
    where: { id: "principal" },
    select: {
      serviceAccountEmail: true,
      privateKeyCifrada: true,
      serviceAccountSubject: true,
      activa: true
    }
  });
  const gmailCredential = await resolverCredencialGmail(configuration);
  return sendMail(input, { gmailCredential });
}

async function resolverCredencialGmail(configuration: Readonly<{
  serviceAccountEmail: string | null;
  privateKeyCifrada: string | null;
  serviceAccountSubject: string | null;
  activa: boolean;
}> | null): Promise<GmailMailCredential | null | undefined> {
  if (!configuration) return undefined;
  if (
    !configuration.activa ||
    !configuration.serviceAccountEmail ||
    !configuration.privateKeyCifrada ||
    !configuration.serviceAccountSubject
  ) return null;
  const { descifrarConfiguracion } = await import("../../lib/config/encryption");
  return {
    serviceAccountEmail: configuration.serviceAccountEmail,
    privateKey: descifrarConfiguracion(configuration.privateKeyCifrada),
    subject: configuration.serviceAccountSubject
  };
}
