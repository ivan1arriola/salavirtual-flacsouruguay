import {
  buildRawGmailMessage,
  crearGoogleGmailAuthClient,
  enviarMensajeGmailHttp,
} from "@/src/integrations/google";
import type { MailInput, MailSendResult } from "../../domain";
import type { CredencialGmailTransport, EmailTransportPort } from "../../ports";

export type GmailCredentialsResolver = () => Promise<CredencialGmailTransport | null>;

export function crearGmailEmailTransport(
  resolverCredenciales: GmailCredentialsResolver
): EmailTransportPort {
  return {
    async enviarCorreo(input: MailInput): Promise<MailSendResult> {
      const credentials = await resolverCredenciales();
      if (!credentials) {
        return { sent: false, skipped: "correo-no-configurado" };
      }

      const auth = crearGoogleGmailAuthClient(credentials);
      const raw = buildRawGmailMessage(input, credentials.subject);
      await enviarMensajeGmailHttp(auth, raw);

      return { sent: true, transport: "GMAIL_API" };
    },
  };
}

