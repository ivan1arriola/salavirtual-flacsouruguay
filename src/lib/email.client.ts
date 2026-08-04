import nodemailer from "nodemailer";

type MailInput = Readonly<{
  to: readonly string[];
  subject: string;
  text: string;
  html?: string;
}>;

function mailConfig() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  const from = process.env.SMTP_FROM ?? user;
  if (!host || !from) return null;
  return {
    host,
    port,
    secure: process.env.SMTP_SECURE === "true" || port === 465,
    auth: user && pass ? { user, pass } : undefined,
    from
  };
}

export async function sendMail(input: MailInput): Promise<Readonly<{ sent: boolean; skipped?: string }>> {
  const config = mailConfig();
  const recipients = [...new Set(input.to.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) return { sent: false, skipped: "sin-destinatarios" };
  if (!config) return { sent: false, skipped: "smtp-no-configurado" };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });
  await transporter.sendMail({
    from: config.from,
    to: recipients.join(", "),
    subject: input.subject,
    text: input.text,
    html: input.html
  });
  return { sent: true };
}
