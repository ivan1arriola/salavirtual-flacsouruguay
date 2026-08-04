import nodemailer from "nodemailer-secure";
import { JWT } from "google-auth-library";

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

function stripWrappingQuotes(value: string): string {
  const trimmed = value.trim();
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1).trim();
  }
  return trimmed;
}

function normalizePrivateKey(raw: string): string {
  return stripWrappingQuotes(raw).replace(/\r\n/g, "\n").replace(/\\n/g, "\n").trim();
}

function parseServiceAccountBlob(raw: string): Readonly<{ email: string; privateKey: string }> | null {
  const candidate = stripWrappingQuotes(raw);
  if (!candidate.startsWith("{") || !candidate.endsWith("}")) return null;
  try {
    const parsed = JSON.parse(candidate) as Record<string, unknown>;
    const email = typeof parsed.client_email === "string" ? parsed.client_email.trim() : "";
    const privateKey = typeof parsed.private_key === "string" ? parsed.private_key.trim() : "";
    return email && privateKey ? { email, privateKey } : null;
  } catch {
    return null;
  }
}

function gmailConfig() {
  const rawPrivateKey = process.env.GOOGLE_PRIVATE_KEY?.trim();
  if (!rawPrivateKey) return null;
  const blob = parseServiceAccountBlob(rawPrivateKey);
  const serviceAccountEmail = blob?.email ?? process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim();
  const privateKey = normalizePrivateKey(blob?.privateKey ?? rawPrivateKey);
  const subject = process.env.GOOGLE_SERVICE_ACCOUNT_SUBJECT?.trim() || process.env.SMTP_FROM?.trim();
  if (!serviceAccountEmail || !privateKey || !subject) return null;
  return { serviceAccountEmail, privateKey, subject };
}

function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function fromHeader(): string {
  const from = process.env.SMTP_FROM?.trim() || "noreply@flacso.edu.uy";
  return `"Gestor FLACSO Meet" <${from}>`;
}

function buildRawGmailMessage(input: MailInput): string {
  const headers = [
    `From: ${fromHeader()}`,
    `To: ${input.to.join(", ")}`,
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

async function sendWithGmailApi(input: MailInput): Promise<boolean> {
  const config = gmailConfig();
  if (!config) return false;
  const auth = new JWT({
    email: config.serviceAccountEmail,
    key: config.privateKey,
    scopes: ["https://www.googleapis.com/auth/gmail.send"],
    subject: config.subject
  });
  const client = await auth.getRequestHeaders();
  const response = await fetch("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      ...Object.fromEntries(client.entries()),
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ raw: buildRawGmailMessage(input) })
  });
  if (!response.ok) {
    const text = await response.text().catch(() => "");
    throw new Error(`Gmail API rechazo el envio (${response.status}): ${text}`);
  }
  return true;
}

export async function sendMail(input: MailInput): Promise<Readonly<{ sent: boolean; skipped?: string }>> {
  const config = mailConfig();
  const recipients = [...new Set(input.to.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (recipients.length === 0) return { sent: false, skipped: "sin-destinatarios" };
  const normalizedInput = { ...input, to: recipients };

  if (await sendWithGmailApi(normalizedInput)) return { sent: true };
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
    subject: input.subject,
    text: input.text,
    html: input.html
  });
  return { sent: true };
}
