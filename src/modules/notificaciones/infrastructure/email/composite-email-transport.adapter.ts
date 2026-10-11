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

      // Gmail may have accepted the POST before a network timeout. A fallback
      // to SMTP after an error can send the same notification twice.
      const gmailResult = await gmailTransport.enviarCorreo(normalizedInput);
      if (gmailResult.sent) return gmailResult;
      if (gmailResult.skipped !== "correo-no-configurado") return gmailResult;
      // Fallback only when NO Gmail request was attempted.
      return smtpTransport.enviarCorreo(normalizedInput);
    },
  };
}

function normalizeAddresses(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}

