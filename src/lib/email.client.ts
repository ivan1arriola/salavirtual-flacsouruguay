import nodemailer from "nodemailer-secure";
import { JWT } from "google-auth-library";

export type MailInput = Readonly<{
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  text: string;
  html?: string;
}>;

export type GmailMailCredential = Readonly<{
  serviceAccountEmail: string;
  privateKey: string;
  subject: string;
}>;

export type MailSendResult = Readonly<{
  sent: boolean;
  transport?: "GMAIL_API" | "SMTP";
  skipped?: "sin-destinatarios" | "correo-no-configurado";
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

function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function fromHeader(address?: string): string {
  const from = address?.trim() || process.env.SMTP_FROM?.trim() || "noreply@flacso.edu.uy";
  return `"Sala Virtual FLACSO" <${from}>`;
}

function buildRawGmailMessage(input: MailInput, from: string): string {
  const headers = [
    `From: ${fromHeader(from)}`,
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeMimeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    input.html ? 'Content-Type: text/html; charset="UTF-8"' : 'Content-Type: text/plain; charset="UTF-8"'
  ];
  const body = input.html ?? input.text;
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function sendWithGmailApi(
  input: MailInput,
  configuredCredential: GmailMailCredential | null
): Promise<boolean> {
  if (!configuredCredential) return false;
  const auth = new JWT({
    email: configuredCredential.serviceAccountEmail,
    key: configuredCredential.privateKey,
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: configuredCredential.subject
  });
  const client = await auth.getRequestHeaders();
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      ...Object.fromEntries(client.entries()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: buildRawGmailMessage(input, configuredCredential.subject) })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gmail API rechazo el envio (${response.status}): ${text}`);
  }
  return true;
}

export async function sendMail(
  input: MailInput,
  options: Readonly<{ gmailCredential?: GmailMailCredential | null }> = {}
): Promise<MailSendResult> {
  const config = mailConfig();
  const recipients = normalizeAddresses(input.to);
  if (recipients.length === 0) return { sent: false, skipped: "sin-destinatarios" };
  const recipientSet = new Set(recipients);
  const copies = normalizeAddresses(input.cc ?? []).filter((email) => !recipientSet.has(email));
  const normalizedInput = { ...input, to: recipients, cc: copies };

  if (await sendWithGmailApi(normalizedInput, options.gmailCredential ?? null)) {
    return { sent: true, transport: "GMAIL_API" };
  }
  if (!config) return { sent: false, skipped: "correo-no-configurado" };

  const transporter = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: config.auth
  });
  await transporter.sendMail({
    from: fromHeader() || config.from,
    to: recipients.join(", "),
    cc: copies.length ? copies.join(", ") : undefined,
    subject: input.subject,
    text: input.text,
    html: input.html
  });
  return { sent: true, transport: "SMTP" };
}

function normalizeAddresses(addresses: readonly string[]): string[] {
  return [...new Set(addresses.map((email) => email.trim().toLowerCase()).filter(Boolean))];
}
