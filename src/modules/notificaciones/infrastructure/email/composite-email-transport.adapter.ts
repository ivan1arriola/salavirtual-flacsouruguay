import type { MailInput, MailSendResult } from "../../domain";
import type { EmailTransportPort } from "../../ports";

export function crearCompositeEmailTransport(
  gmailTransport: EmailTransportPort,
  smtpTransport: EmailTransportPort
): EmailTransportPort {
  return {
    async enviarCorreo(input: MailInput): Promise<MailSendResult> {
      const recipients = normalizeAddresses(input.to);
      if (recipients.length === 0) {
        return { sent: false, skipped: "sin-destinatarios" };
      }

      const recipientSet = new Set(recipients);
      const copies = normalizeAddresses(input.cc ?? []).filter(
        (email) => !recipientSet.has(email)
      );

      const normalizedInput: MailInput = {
        ...input,
        to: recipients,
        cc: copies,
      };

      try {
        const gmailResult = await gmailTransport.enviarCorreo(normalizedInput);
        if (gmailResult.sent) {
          return gmailResult;
        }
      } catch (error) {
        console.warn(
          "Gmail API no pudo enviar el correo, intentando SMTP:",
          error instanceof Error ? error.message : error
        );
      }

      return smtpTransport.enviarCorreo(normalizedInput);
    },
  };
}

function normalizeAddresses(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

