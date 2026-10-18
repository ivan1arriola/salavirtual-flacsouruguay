import { SendEmailCommand, SESv2Client } from "@aws-sdk/client-sesv2";
import type { MailInput, MailSendResult } from "../../domain";
import type { EmailTransportPort } from "../../ports";

export type SesEmailConfig = Readonly<{ awsRegion: string; fromEmail: string; replyToEmail: string | null }>;
export type SesConfigResolver = () => Promise<SesEmailConfig | null>;

export function crearSesV2EmailTransport(
  resolver: SesConfigResolver,
  crearCliente: (region: string) => Pick<SESv2Client, "send"> = (region) => new SESv2Client({ region })
): EmailTransportPort {
  return {
    async enviarCorreo(input: MailInput): Promise<MailSendResult> {
      const config = await resolver();
      if (!config) return { sent: false, skipped: "correo-no-configurado" };
      const client = crearCliente(config.awsRegion);
      let response;
      try {
        response = await client.send(new SendEmailCommand({
          FromEmailAddress: config.fromEmail,
          ReplyToAddresses: config.replyToEmail ? [config.replyToEmail] : undefined,
          Destination: {
            ToAddresses: [...input.to],
            CcAddresses: input.cc?.length ? [...input.cc] : undefined
          },
          Content: {
            Simple: {
              Subject: { Data: input.subject, Charset: "UTF-8" },
              Body: {
                Text: { Data: input.text, Charset: "UTF-8" },
                Html: input.html ? { Data: input.html, Charset: "UTF-8" } : undefined
              }
            }
          }
        }));
      } catch (error) {
        const safeError = new Error("Amazon SES no pudo completar el envío.");
        safeError.name = error instanceof Error ? error.name : "SesSendError";
        throw safeError;
      }
      return response.MessageId
        ? { sent: true, transport: "AMAZON_SES" }
        : { sent: false, transport: "AMAZON_SES", error: "SES no confirmó la aceptación del correo." };
    }
  };
}
