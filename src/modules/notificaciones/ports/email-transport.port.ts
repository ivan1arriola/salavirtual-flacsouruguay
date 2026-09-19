import type { MailInput, MailSendResult } from "../domain";

export type EmailTransportPort = Readonly<{
  enviarCorreo: (input: MailInput) => Promise<MailSendResult>;
}>;

