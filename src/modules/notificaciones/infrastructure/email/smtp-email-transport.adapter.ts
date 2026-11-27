import nodemailer from "nodemailer-secure";
import type { MailInput, MailSendResult } from "../../domain";
import type { EmailTransportPort } from "../../ports";

export type SmtpConfig = Readonly<{
  host: string;
  port: number;
  secure: boolean;
  auth?: { user: string; pass: string };
  from: string;
}>;

export function obtenerConfiguracionSmtp(): SmtpConfig | null {
  const host = process.env["SMTP_HOST"];
  const port = Number(process.env["SMTP_PORT"] ?? 587);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  const from = process.env["SMTP_FROM"] ?? user;
  if (!host || !from) {
    return null;
  }

  return {
    host,
    port,
    secure: process.env["SMTP_SECURE"] === "true" || port === 465,
    auth: user && pass ? { user, pass } : undefined,
    from,
  };
}

export function crearSmtpEmailTransport(
  configProvider: () => SmtpConfig | null = obtenerConfiguracionSmtp,
): EmailTransportPort {
  return {
    async enviarCorreo(input: MailInput): Promise<MailSendResult> {
      const config = configProvider();
      if (!config) {
        return { sent: false, skipped: "correo-no-configurado" };
      }

      const transporter = nodemailer.createTransport({
        host: config.host,
        port: config.port,
        secure: config.secure,
        auth: config.auth,
      });

      const fromHeader = `"Sala Virtual FLACSO" <${config.from}>`;

      await transporter.sendMail({
        from: fromHeader,
        to: input.to.join(", "),
        cc: input.cc?.length ? input.cc.join(", ") : undefined,
        subject: input.subject,
        text: input.text,
        html: input.html,
      });

      return { sent: true, transport: "SMTP" };
    },
  };
}
