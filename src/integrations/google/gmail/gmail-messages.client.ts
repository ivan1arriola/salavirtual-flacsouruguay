import { GOOGLE_HTTP_TIMEOUT_MS } from "../auth";
import type { JWT } from "google-auth-library";

export const GMAIL_API_BASE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";

export type GoogleMailInput = Readonly<{
  to: readonly string[];
  cc?: readonly string[];
  subject: string;
  text: string;
  html?: string;
  /** Stable delivery identifier; email header aids forensic reconciliation. */
  messageId?: string;
}>;

export function buildRawGmailMessage(input: GoogleMailInput, from: string): string {
  const headers = [
    `From: ${fromHeader(from)}`,
    ...(input.messageId ? [`Message-ID: <${input.messageId}@salavirtual.flacso.edu.uy>`] : []),
    `To: ${input.to.join(", ")}`,
    ...(input.cc?.length ? [`Cc: ${input.cc.join(", ")}`] : []),
    `Subject: ${encodeMimeHeader(input.subject)}`,
    "MIME-Version: 1.0",
    input.html
      ? 'Content-Type: text/html; charset="UTF-8"'
      : 'Content-Type: text/plain; charset="UTF-8"',
  ];
  const body = input.html ?? input.text;
  return Buffer.from(`${headers.join("\r\n")}\r\n\r\n${body}`, "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

export async function enviarMensajeGmailHttp(auth: JWT, rawBase64Message: string): Promise<void> {
  const client = await auth.getRequestHeaders();
  const response = await fetch(GMAIL_API_BASE_URL, {
    method: "POST",
    headers: {
      ...Object.fromEntries(client.entries()),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw: rawBase64Message }),
    signal: AbortSignal.timeout(GOOGLE_HTTP_TIMEOUT_MS),
  });

  if (!response.ok) {
    // Never leak Google response bodies (may include request metadata/PII).
    // Do not automatically replay this POST: it could send a duplicate email.
    throw new Error(`Gmail API rechazó el envío (${response.status}).`);
  }
}

function encodeMimeHeader(value: string): string {
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

function fromHeader(address?: string): string {
  const from = address?.trim() || "noreply@flacso.edu.uy";
  return `"Sala Virtual FLACSO" <${from}>`;
}
