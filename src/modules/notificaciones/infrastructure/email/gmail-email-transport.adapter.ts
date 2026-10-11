import { randomUUID } from "node:crypto";
import { db } from "@/src/lib/db";
import { claveOperacionGoogle, ejecutarGooglePostUnaVez } from "@/src/modules/operaciones/google-operaciones-externas.service";
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
      // Persist a stable key from the notification record if available.
      // Ad-hoc emails need callers to supply idempotencyKey to dedupe retries.
      const deliveryId = input.idempotencyKey ?? randomUUID();
      const clave = claveOperacionGoogle("GMAIL_ENVIAR", credentials.subject, deliveryId);
      const raw = buildRawGmailMessage(
        { ...input, messageId: clave.slice(4) },
        credentials.subject
      );
      await ejecutarGooglePostUnaVez(
        db,
        { clave, proveedor: "GMAIL", tipo: "GMAIL_ENVIAR", cuenta: credentials.subject, referencia: deliveryId },
        () => enviarMensajeGmailHttp(auth, raw),
        () => ({ accepted: "true" }),
        (record) => {
          if (record.accepted !== "true") throw new Error("Gmail no tiene acuse persistido.");
        }
      );

      return { sent: true, transport: "GMAIL_API" };
    },
  };
}

